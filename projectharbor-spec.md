# ProjectHarbor v2 — Revised Architecture & Complete Build Specification
## Claude Code Multi-Agent Build File

---

## CRITICAL ARCHITECTURE CHANGES FROM v1

### Problem with v1
v1 assumes MacBook is always-on. User's actual requirements:
1. **PC runs independently** — Jupyter must never stop, even if MacBook shuts down
2. **On-demand connection** — connect from any device, anytime, no disruption to PC
3. **Colab-like UI** — not just Jupyter iframe, but a full notebook interface built-in
4. **PC collects its own diagnostics** — lightweight, low storage

### v2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WINDOWS PC (always on)                        │
│                                                                  │
│  ┌─ ProjectHarbor Agent (Python, Windows Service) ──────────────┐ │
│  │  • Jupyter watchdog (auto-restart if crashes)             │ │
│  │  • Metrics collector → local SQLite (rolling 48h)         │ │
│  │  • REST API on :9111 (health, metrics, jupyter status)    │ │
│  │  • Jupyter proxy (forwards kernel WS to authenticated)    │ │
│  │  • Git auto-commit daemon (optional)                      │ │
│  │  • Process monitor                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Jupyter Server (127.0.0.1:8888) ← managed by agent            │
│  Python envs, Git repos, Project files                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ Tailscale (100.x.x.x)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  ANY DEVICE (MacBook, phone, tablet, office PC)                 │
│                                                                  │
│  ProjectHarbor Web App (Next.js)                                   │
│  • Can run on MacBook OR be hosted anywhere                     │
│  • Connects to PC agent on-demand via Tailscale                 │
│  • Built-in Colab-like notebook UI (Jupyter kernel protocol)    │
│  • SSH terminal (direct to PC)                                  │
│  • All management features                                      │
│  • Reads PC agent's collected metrics on connect                │
│  • Zero state on PC when disconnected — PC just works           │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle**: PC is the server. MacBook is the client. Not the other way around.

---

## FEATURE GAP ANALYSIS (v1 → v2 additions)

### Missing from v1 spec:

**P1 — Critical**
- [ ] PC-side agent (watchdog + metrics + API) — entire new component
- [ ] Built-in Colab-like notebook UI with kernel protocol support
- [ ] Jupyter watchdog (auto-restart on crash)
- [ ] PC-side local SQLite for offline metrics storage
- [ ] Graceful reconnection — never interrupts PC work
- [ ] Cell-level execution from browser (not just iframe)
- [ ] Cell output streaming (stdout, stderr, rich output, images)
- [ ] Kernel interrupt/restart from notebook UI
- [ ] Variable inspector panel
- [ ] Notebook autosave to disk (periodic .ipynb write)

**P2 — Important**
- [ ] Multi-notebook support (open multiple notebooks in tabs)
- [ ] Cell execution queue visualization
- [ ] Execution timer per cell
- [ ] Collapsible cell outputs
- [ ] Table of contents from markdown headings
- [ ] Find & replace across notebook
- [ ] Cell drag-and-drop reorder
- [ ] Undo/redo for cell operations
- [ ] Notebook checkpoints (Jupyter checkpoint API)
- [ ] GPU memory chart in monitoring
- [ ] Training progress tracker (parse stdout for loss/epoch)
- [ ] Experiment logger (track runs with params + metrics)
- [ ] Dataset file browser (preview CSV/images in data dir)
- [ ] Tensorboard proxy/embed
- [ ] Multi-file editor tabs (edit multiple files simultaneously)
- [ ] SSH tunnel manager (arbitrary port forwards)
- [ ] PC power management (sleep/wake schedule)

**P3 — Nice to have**
- [ ] Collaborative editing (multiple browser tabs, same notebook)
- [ ] Cell execution history (re-run previous versions of a cell)
- [ ] Notebook diffing (visual cell-by-cell diff)
- [ ] Plot interactivity (plotly/bokeh rendering in notebook UI)
- [ ] Code completion in notebook cells (basic)
- [ ] Snippet insertion into notebook cells
- [ ] Export notebook as PDF/HTML from UI
- [ ] Dashboard widgets (customizable home screen)
- [ ] Mobile-optimized monitoring view
- [ ] Webhook notifications (Discord/Telegram on events)

---

## COMPONENT 1: PC-SIDE AGENT (Python, Windows Service)

### File: `pc-agent/agent.py` (~600 lines)

```python
# Lightweight Python service — NO heavy deps
# Requirements: flask, psutil, sqlite3 (stdlib), watchdog
# Install: pip install flask psutil requests

import sqlite3, psutil, time, subprocess, os, json, threading, signal
from flask import Flask, jsonify, request
from datetime import datetime, timedelta

DB_PATH = os.path.expanduser("~/projectharbor-agent/agent.db")
CONFIG_PATH = os.path.expanduser("~/projectharbor-agent/config.json")
LOG_PATH = os.path.expanduser("~/projectharbor-agent/agent.log")

# Default config
DEFAULT_CONFIG = {
    "jupyter_port": 8888,
    "jupyter_token": "",
    "jupyter_env_path": "",  # e.g. F:\\...\\env
    "jupyter_notebook_dir": "",  # e.g. F:\\Research\\Thesis
    "agent_port": 9111,
    "metrics_interval_sec": 30,
    "metrics_retention_hours": 48,
    "jupyter_watchdog": True,
    "auto_commit_enabled": False,
    "auto_commit_interval_min": 60,
    "git_repo_path": "",
    "tailscale_only": True
}
```

### Agent DB Schema (local SQLite on PC)

```sql
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    cpu_pct REAL, ram_pct REAL, ram_used_gb REAL, ram_total_gb REAL,
    gpu_pct REAL, gpu_vram_pct REAL, gpu_vram_gb REAL, gpu_temp REAL,
    disk_json TEXT, net_sent_kbps REAL, net_recv_kbps REAL
);
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts DESC);

CREATE TABLE IF NOT EXISTS jupyter_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    event TEXT NOT NULL,  -- start|stop|crash|restart|watchdog_restart
    details TEXT
);

CREATE TABLE IF NOT EXISTS process_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    processes_json TEXT  -- top 20 by CPU
);
```

### Agent REST API

```
GET  /health              → { status, uptime, jupyter_status, jupyter_pid, jupyter_uptime }
GET  /metrics?hours=6     → [ {ts, cpu, ram, gpu, disk, net}, ... ]
GET  /metrics/latest      → single latest metrics object
GET  /jupyter/status      → { running, pid, port, uptime_sec, url }
POST /jupyter/start       → starts jupyter if not running
POST /jupyter/stop        → stops jupyter gracefully
POST /jupyter/restart     → stop + start
GET  /jupyter/events      → last 50 jupyter lifecycle events
GET  /processes           → current process list (top 30 by CPU)
POST /processes/kill      → { pid } kill a process
GET  /system              → { hostname, os, cpu_count, ram_total, gpus, disks }
GET  /git/status?path=    → git status for a repo path
POST /git/pull?path=      → git pull
POST /git/commit?path=    → { message } git add -A && git commit
GET  /config              → current agent config
PUT  /config              → update agent config
GET  /logs?lines=100      → last N lines of agent log
```

### Jupyter Watchdog Logic

```python
class JupyterWatchdog(threading.Thread):
    def run(self):
        while self.running:
            if config["jupyter_watchdog"]:
                if not self.is_jupyter_running():
                    self.log("Jupyter not running, restarting...")
                    self.start_jupyter()
                    self.record_event("watchdog_restart")
            time.sleep(15)  # check every 15 seconds

    def is_jupyter_running(self):
        # Check if port is listening
        for conn in psutil.net_connections():
            if conn.laddr.port == config["jupyter_port"] and conn.status == "LISTEN":
                return True
        return False

    def start_jupyter(self):
        env_python = os.path.join(config["jupyter_env_path"], "Scripts", "python.exe")
        cmd = [env_python, "-m", "jupyter", "notebook",
               "--ip=127.0.0.1",
               f"--port={config['jupyter_port']}",
               "--no-browser",
               "--ServerApp.allow_origin=*",
               "--ServerApp.allow_credentials=True",
               f"--IdentityProvider.token={config['jupyter_token']}",
               f"--notebook-dir={config['jupyter_notebook_dir']}"]
        subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW)
```

### Install as Windows Service

```python
# install_service.py — uses NSSM or native sc.exe
# Option 1: NSSM (recommended)
# nssm install ProjectHarborAgent "C:\path\to\python.exe" "C:\path\to\agent.py"
# nssm set ProjectHarborAgent AppDirectory "C:\path\to\projectharbor-agent"
# nssm set ProjectHarborAgent Start SERVICE_AUTO_START

# Option 2: Task Scheduler (simpler)
# schtasks /create /tn "ProjectHarborAgent" /tr "pythonw agent.py" /sc onstart /ru SYSTEM
```

### Metrics Cleanup (runs hourly inside agent)

```python
def cleanup_metrics():
    cutoff = int(time.time()) - (config["metrics_retention_hours"] * 3600)
    db.execute("DELETE FROM metrics WHERE ts < ?", (cutoff,))
    db.execute("DELETE FROM process_log WHERE ts < ?", (cutoff,))
```

---

## COMPONENT 2: COLAB-LIKE NOTEBOOK UI

### Architecture

The notebook UI connects directly to Jupyter's APIs:
1. **REST API** (`http://PC_IP:8888/api/`) — file ops, session management, kernel management
2. **WebSocket** (`ws://PC_IP:8888/api/kernels/{id}/channels`) — kernel protocol (execute, output streaming)

All proxied through the ProjectHarbor Next.js server to handle auth + Tailscale routing.

### Jupyter Kernel Protocol (WebSocket Messages)

**CRITICAL**: Messages use the Jupyter Wire Protocol v5.3. Every message must have
ALL header fields or the kernel silently drops it.

```typescript
// CORRECT execute_request format (all fields required)
// NOTE: Use uuid package's v4(), NOT crypto.randomUUID() — Safari <15.4 lacks it
{
  header: {
    msg_id: uuidv4(),            // import { v4 as uuidv4 } from 'uuid'
    session: sessionId,       // fixed per connection, generated once
    username: 'projectharbor',
    date: new Date().toISOString(),
    msg_type: 'execute_request',
    version: '5.3'
  },
  parent_header: {},
  metadata: {},
  content: {
    code: "print('hello')",
    silent: false,
    store_history: true,
    user_expressions: {},
    allow_stdin: false,       // set true if you handle input_request
    stop_on_error: true
  },
  buffers: [],
  channel: 'shell'           // REQUIRED: messages go to specific channels
}

// CHANNELS (multiplexed on same WebSocket):
// 'shell'   — execute_request, inspect_request, complete_request
// 'iopub'   — stream, execute_result, display_data, error, status
// 'stdin'   — input_request (Python input() calls)
// 'control' — shutdown_request, interrupt_request (but interrupt is usually REST)

// Output types received on IOPUB channel:
// stream:         { name: "stdout"|"stderr", text: "..." }
// execute_result: { data: {"text/plain": "..."}, execution_count: N, metadata: {} }
// display_data:   { data: {"image/png": "base64..."}, metadata: {}, transient: {} }
// update_display_data: same as display_data, uses transient.display_id to update
// error:          { ename, evalue, traceback: [...] }
// status:         { execution_state: "busy"|"idle" }
// execute_input:  { code, execution_count }  — echo of what was sent
// clear_output:   { wait: bool }  — clear cell output

// IMPORTANT: Kernel interrupt and restart are REST API calls, NOT WebSocket:
// POST /api/kernels/{kernelId}/interrupt  — interrupts current execution
// POST /api/kernels/{kernelId}/restart    — restarts kernel (kills all state)
// These go through the Jupyter proxy route, not the kernel WS relay.
```

### Cell Source Format Conversion

```typescript
// .ipynb source can be string OR string[] — must handle both on load
function loadCellSource(source: string | string[]): string {
  if (Array.isArray(source)) return source.join('');
  return source;
}

// On save, convert back to string (Jupyter accepts both, but string is simpler)
function saveCellSource(source: string): string {
  return source;
}
```

### Cell Execution Queue (CRITICAL for Run All)

```typescript
// Run All sends cells SEQUENTIALLY, not in parallel.
// The kernel queues internally, but UI needs to track queue state.
class CellExecutionQueue {
  private queue: string[] = [];  // cell IDs
  private executing: string | null = null;

  enqueue(cellIds: string[]) {
    this.queue.push(...cellIds);
    if (!this.executing) this.executeNext();
  }

  private executeNext() {
    if (this.queue.length === 0) { this.executing = null; return; }
    this.executing = this.queue.shift()!;
    setCellStatus(this.executing, 'running');
    sendExecuteRequest(this.executing);
    // When kernel sends status:idle for this cell's msg_id → executeNext()
  }

  onCellComplete(cellId: string) {
    if (cellId === this.executing) this.executeNext();
  }

  clear() { this.queue = []; this.executing = null; }
  interrupt() { this.clear(); /* + call REST interrupt */ }
}
```

### Variable Inspector Implementation

```typescript
// The variable inspector executes hidden introspection code in the kernel.
// Sent as silent=true so it doesn't appear in cell execution history.

const INSPECT_CODE = `
import json as __ros_json
__ros_vars = {}
for __ros_name in [n for n in dir() if not n.startswith('_')]:
    __ros_obj = eval(__ros_name)
    __ros_vars[__ros_name] = {
        'type': type(__ros_obj).__name__,
        'size': str(getattr(__ros_obj, 'shape', getattr(__ros_obj, '__len__', lambda: '?')())),
        'repr': repr(__ros_obj)[:200]
    }
print(__ros_json.dumps(__ros_vars))
del __ros_vars, __ros_name, __ros_obj, __ros_json
`;

// Send with: silent=true, store_history=false
// Parse the stdout output as JSON
// Run every time kernel goes idle (throttled to max 1/second)
```

### HTML Output Sanitization (SECURITY CRITICAL)

```typescript
// MUST sanitize HTML outputs before rendering.
// Install: npm i dompurify isomorphic-dompurify
// Import: import DOMPurify from 'isomorphic-dompurify';

function renderHtmlOutput(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'pre', 'code', 'table', 'thead',
                   'tbody', 'tr', 'td', 'th', 'img', 'a', 'br', 'hr',
                   'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
                   'strong', 'em', 'b', 'i', 'sup', 'sub', 'style'],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'href', 'target',
                   'colspan', 'rowspan', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
    ADD_TAGS: ['style'],  // Allow <style> for pandas DataFrame styling
  });
}

// ANSI color parsing: npm i anser
// import Anser from 'anser';
// const html = Anser.ansiToHtml(text, { use_classes: true });
```

### Notebook UI Component Tree

```
NotebookPage
├── NotebookToolbar
│   ├── SaveButton [💾 Save / Saving... / ✓ Saved / ⚠ Failed] (Ctrl+S)
│   │   └── Shows state: normal → saving (spinner) → saved (2s) → back to normal
│   ├── RunCellButton (Shift+Enter)
│   ├── RunAllButton
│   ├── StopButton (kernel interrupt via REST, not WS)
│   ├── RestartKernelButton (with confirmation dialog)
│   ├── KernelStatusIndicator (idle ● / busy ● / dead ● / reconnecting ◌)
│   ├── CellTypeSelector (code/markdown/raw dropdown)
│   ├── UndoRedoButtons (cell operations, not text edits)
│   └── MoreMenu (export, checkpoint, trust, clear all outputs)
├── NotebookTabs (multi-notebook)
├── TableOfContents (from markdown headings, collapsible sidebar)
├── CellList
│   ├── Cell (repeated)
│   │   ├── CellGutter
│   │   │   ├── ExecutionCount [N] / [*] while running / [ ] never run
│   │   │   ├── RunButton (play icon)
│   │   │   ├── CellMenu (move up/down, delete, toggle type)
│   │   │   └── DragHandle
│   │   ├── CellInput
│   │   │   ├── CodeEditor (CodeMirror 6 with Python, completions)
│   │   │   └── MarkdownEditor (CodeMirror 6 with markdown)
│   │   ├── CellOutput (collapsible)
│   │   │   ├── TextOutput (stdout/stderr with ANSI color via anser)
│   │   │   ├── RichOutput (HTML rendering — SANITIZED with DOMPurify)
│   │   │   ├── ImageOutput (PNG/SVG/JPEG inline as base64 img)
│   │   │   ├── ErrorOutput (traceback with syntax highlighting, collapsible)
│   │   │   ├── DataFrameOutput (scrollable HTML table from pandas)
│   │   │   └── PlotOutput (matplotlib/plotly rendered as image or HTML)
│   │   └── CellStatusBar
│   │       ├── ExecutionTimer ("2.3s" or "Running... 4s")
│   │       └── MemoryDelta (optional)
│   └── AddCellButton (between cells, + icon on hover)
├── VariableInspector (right sidebar, toggle with Ctrl+Shift+H)
│   ├── VariableTable (name, type, shape/size, value preview)
│   └── RefreshButton
└── StatusBar
    ├── KernelName ("Python 3.11")
    ├── CellCount ("42 cells")
    ├── ConnectionStatus ("● Connected" / "◌ Reconnecting..." / "● Disconnected")
    ├── SaveStatus ("Last saved: 2 min ago" / "Unsaved changes" in yellow / "Saving...")
    └── CursorPosition ("Ln 15, Col 8")
```

### Save Behavior (matches Google Colab)

```
THREE save mechanisms:
1. Save button in toolbar — always visible, shows state
2. Ctrl+S / Cmd+S keyboard shortcut — immediate save
3. Autosave every 120s while dirty (skips if cell executing)

Save target: PUT /api/contents/{path} on Jupyter REST API
This writes directly to the .ipynb file on the PC's disk.

Dirty tracking: set dirty=true on cell source edit, cell add/delete/move/type-change.
NOT dirty on: kernel outputs arriving, execution count updates, status changes.

Unsaved changes guard: window.beforeunload prevents accidental browser close.

Save conflict handling: if Jupyter returns 409 (file modified externally),
show dialog: "File was modified externally. Overwrite or Reload?"

Notebook metadata: PRESERVE original kernelspec + language_info on save.
```

### Key Notebook Interactions

```typescript
// Cell execution flow
async function executeCell(cellId: string) {
  const cell = cells.find(c => c.id === cellId);
  setCellStatus(cellId, 'running');
  setCellStartTime(cellId, Date.now());
  clearCellOutputs(cellId);

  const msgId = crypto.randomUUID();
  kernelWs.send(JSON.stringify({
    header: { msg_type: 'execute_request', msg_id: msgId, session: sessionId },
    parent_header: {},
    metadata: {},
    content: {
      code: cell.source,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false
    }
  }));

  // Outputs arrive via WS as separate messages, matched by parent_header.msg_id
}

// Save notebook to disk
async function saveNotebook() {
  const notebook = serializeCells(); // Convert cells to .ipynb format
  await fetch(`/api/proxy/jupyter/api/contents/${notebookPath}`, {
    method: 'PUT',
    body: JSON.stringify({ content: notebook, type: 'notebook' })
  });
}

// Notebook .ipynb format
interface NotebookDocument {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: { kernelspec: {...}, language_info: {...} };
  cells: Array<{
    cell_type: 'code' | 'markdown' | 'raw';
    source: string;
    metadata: {};
    outputs?: OutputItem[];  // code cells only
    execution_count?: number | null;
  }>;
}
```

### Notebook UI Design Spec

```
Color scheme: Match Google Colab aesthetic but darker, more refined
- Background: #1a1a2e (deep navy-charcoal)
- Cell background: #16213e (slightly lighter)
- Active cell border-left: #0f3460 (3px solid blue accent)
- Running cell: pulsing #e94560 left border
- Toolbar: #0f3460
- Text: #e8e8e8
- Code font: 'JetBrains Mono', 14px
- UI font: 'DM Sans', system-ui
- Execution count: #7f8c8d (muted)
- stdout: #e8e8e8
- stderr: #e94560
- Markdown rendered: standard prose styling, slightly larger
```

### Jupyter Proxy Routes (Next.js API)

```typescript
// src/app/api/proxy/jupyter/[...path]/route.ts
// Proxies all requests to PC's Jupyter server via Tailscale
// Adds token auth header
// Handles WebSocket upgrade for kernel channels

export async function GET(req, { params }) {
  const pcHost = getProjectSetting('ssh.host');
  const jupyterPort = getProjectSetting('jupyter.port');
  const token = getProjectSetting('jupyter.token');
  const path = params.path.join('/');

  const resp = await fetch(
    `http://${pcHost}:${jupyterPort}/api/${path}`,
    { headers: { Authorization: `token ${token}` } }
  );
  return new Response(resp.body, { status: resp.status });
}
```

---

## COMPONENT 3: REVISED FRONTEND DESIGN

### Design Direction: "Scientific Terminal" — not AI slop

**Aesthetic**: Dense, information-rich, dark. Like a Bloomberg terminal meets VS Code meets Grafana. Monospace everywhere. No rounded gradient cards. No purple-blue gradients. No generic dashboard look.

**Typography**:
- Primary: `'IBM Plex Mono'` (everything monospace — scientific, precise)
- Headings: `'Space Grotesk'` — NO, use `'Instrument Sans'` or `'Geist'`
- Actually: Use `'Berkeley Mono'` if available, fallback `'JetBrains Mono'`
- Code: `'JetBrains Mono'`

**Color System** (revised from v1 — more intentional):
```css
:root {
  /* Base - true dark, not GitHub dark */
  --bg-0: #0a0a0f;        /* deepest background */
  --bg-1: #12121a;        /* main content bg */
  --bg-2: #1a1a28;        /* cards, panels */
  --bg-3: #242438;        /* elevated, hover */
  --bg-4: #2e2e48;        /* active, selected */

  /* Borders */
  --border-subtle: #1e1e30;
  --border-default: #2a2a42;
  --border-strong: #3a3a58;

  /* Text */
  --text-0: #f0f0f5;      /* primary */
  --text-1: #b0b0c0;      /* secondary */
  --text-2: #707088;      /* muted */
  --text-3: #484860;      /* disabled */

  /* Accent - single strong accent, not rainbow */
  --accent: #6366f1;       /* indigo - primary action */
  --accent-hover: #818cf8;
  --accent-muted: #6366f120;

  /* Semantic */
  --ok: #22c55e;
  --warn: #eab308;
  --err: #ef4444;
  --info: #3b82f6;

  /* Special */
  --jupyter-running: #22c55e;
  --jupyter-busy: #eab308;
  --cell-active: #6366f1;
  --cell-running: #ef4444;
}
```

**Layout Rules**:
- No border-radius > 6px anywhere
- 1px borders, never 2px
- Compact spacing: 4px/8px/12px/16px scale
- Status indicators: 6px circles, not badges
- Tables: zebra stripe with --bg-2/--bg-3 alternating
- Buttons: ghost style default, filled only for primary actions
- No shadows except for overlays/dropdowns

**Icon System**: Lucide icons, strokeWidth=1.5, size 16px default

---

## COMPONENT 4: FULL REVISED FEATURE LIST (v2)

### Added features (on top of v1's A-P groups):

**Group Q — Colab Notebook UI**
- Q1. Full notebook rendering with code/markdown/raw cells
- Q2. Code cell editing with CodeMirror 6 (Python syntax, bracket matching, auto-indent)
- Q3. Markdown cell editing with live preview toggle
- Q4. Cell execution via kernel WebSocket protocol
- Q5. Streaming output display (stdout, stderr, rich, images, errors)
- Q6. Execution count display per cell
- Q7. Cell execution timer (elapsed time while running)
- Q8. Add cell above/below (code or markdown)
- Q9. Delete cell with undo
- Q10. Move cell up/down (keyboard shortcut + drag)
- Q11. Cell type toggle (code ↔ markdown ↔ raw)
- Q12. Run all cells / Run cells above / Run cells below
- Q13. Clear all outputs
- Q14. Kernel interrupt from toolbar
- Q15. Kernel restart from toolbar (with confirmation)
- Q16. Kernel status indicator (idle/busy/starting/dead/reconnecting)
- Q17. Multi-notebook tabs (open multiple .ipynb files)
- Q18. Table of contents sidebar (auto-generated from markdown headings)
- Q19. Find and replace in notebook (Ctrl+H)
- Q20. Cell collapsing (collapse input, collapse output, collapse both)
- Q21. Notebook autosave (every 60s while connected)
- Q22. Keyboard shortcuts: Shift+Enter (run+next), Ctrl+Enter (run), Alt+Enter (run+insert)
- Q23. Variable inspector panel (kernel introspection)
- Q24. DataFrame rendering as scrollable HTML table
- Q25. Image output display (PNG, SVG, JPEG inline)
- Q26. Error traceback with syntax highlighting and clickable filenames
- Q27. ANSI color support in text output
- Q28. Notebook export (download as .ipynb, .py, .html)
- Q29. Cell folding (collapse long cells)
- Q30. Notebook trust status
- Q31. Checkpoint create/restore (Jupyter checkpoint API)

**Group R — PC Agent Integration**
- R1. Agent health check on connect
- R2. Read historical metrics from agent DB (offline hours)
- R3. Jupyter watchdog status display
- R4. Agent config editor in UI
- R5. Agent log viewer
- R6. Jupyter lifecycle event history (starts, stops, crashes)
- R7. Agent auto-update check
- R8. PC sleep prevention (agent-side, configurable)

**Group S — Enhanced Monitoring**
- S1. Training progress parser (detect loss, accuracy, epoch from cell output)
- S2. GPU memory waterfall chart
- S3. Network latency indicator (ping to PC)
- S4. Disk I/O rate
- S5. Per-process GPU usage (nvidia-smi per-pid)

---

## MULTI-AGENT BUILD STRATEGY FOR CLAUDE CODE

### Agent Roles

```
ORCHESTRATOR (main Claude Code session)
├── AGENT-1: Backend Core (DB, SSH, services)
├── AGENT-2: API Layer (routes, validation, middleware)
├── AGENT-3: PC Agent (Python, standalone)
├── AGENT-4: Notebook UI (Colab-like frontend)
├── AGENT-5: Dashboard & Management UI
├── AGENT-6: Integration & Testing
└── AGENT-7: Polish & Hardening
```

### Build Order (dependency-aware)

```
Phase 1 — Foundation (AGENT-1)
  Task 001: Project scaffold, deps, directory structure
  Task 002: DB schema + migrations + seed
  Task 003: SSH pool + SFTP + command allowlist

Phase 2 — Services (AGENT-1 continues)
  Task 004: All service files (project, git, jupyter, env, files, metrics, etc.)

Phase 3 — API + PC Agent (AGENT-2 + AGENT-3 parallel)
  Task 005: All API routes (AGENT-2)
  Task 006: PC-side Python agent (AGENT-3, independent)

Phase 4 — Core UI (AGENT-4 + AGENT-5 parallel)
  Task 007: Notebook UI — cell rendering, editing, kernel protocol (AGENT-4)
  Task 008: Dashboard, project list, status bar (AGENT-5)
  Task 009: Terminal (xterm.js + WebSocket) (AGENT-5)
  Task 010: File browser + CodeMirror editor (AGENT-5)

Phase 5 — Management UI (AGENT-5 continues)
  Task 011: Git management page
  Task 012: Environment manager
  Task 013: Jupyter control page (merged with notebook UI)
  Task 014: Process manager + monitoring
  Task 015: Schedules, journal, todos, snippets
  Task 016: Project wizard
  Task 017: Command palette + keyboard shortcuts
  Task 018: Notifications
  Task 019: Settings + Tailscale

Phase 6 — Integration (AGENT-6)
  Task 020: End-to-end integration tests
  Task 021: WebSocket reliability testing
  Task 022: Notebook UI ↔ Jupyter integration testing
  Task 023: PC Agent ↔ ProjectHarbor integration testing

Phase 7 — Hardening (AGENT-7)
  Task 024: Security audit (path traversal, command injection, token masking)
  Task 025: Error handling, recovery, graceful degradation
  Task 026: Performance (lazy loading, virtualized lists, WS reconnect)
  Task 027: Documentation (README, install guide, troubleshooting)
```

### Token Conservation Strategy for Claude Code

```
RULES FOR EVERY AGENT:
1. Never regenerate working code — use str_replace for targeted edits
2. Generate files in dependency order — avoid back-and-forth edits
3. Use shared utility modules — don't duplicate (e.g., db client, ssh pool, types)
4. Create types.ts first — all agents reference same types
5. Stub-then-implement: create all file stubs with exports first, then fill
6. Test incrementally: compile-check after every file, not at the end
7. Use barrel exports (index.ts) to avoid import path issues
8. Don't pretty-print large JSON/SQL in logs — waste of tokens
9. Template patterns: create one route file perfectly, copy pattern for others
10. Batch similar files: all git routes in one pass, all jupyter routes in one pass
```

---

## COMPLETE CLAUDE CODE PROMPT

Below is the prompt to paste into Claude Code. It is self-contained.

---

```markdown
# RESEARCHOS v2 — BUILD INSTRUCTIONS

You are building ProjectHarbor, a research operations platform. Read this ENTIRE prompt before writing any code.

## PROJECT OVERVIEW

ProjectHarbor has 2 deployable components:
1. **Web App** (Next.js) — runs on MacBook or any machine, connects to PC on-demand
2. **PC Agent** (Python) — runs permanently on Windows PC as a service

The web app connects to the PC via Tailscale for SSH, Jupyter API, and agent API.

## TECH STACK

Web App:
- Next.js 15 (App Router, TypeScript, Tailwind CSS)
- better-sqlite3 + drizzle-orm (local DB on web app machine)
- ssh2 (SSH/SFTP to PC)
- ws (WebSocket server for terminal + metrics + kernel relay)
- xterm.js (terminal)
- CodeMirror 6 (code editor + notebook cells)
- recharts (charts)
- shadcn/ui (base components)
- lucide-react (icons)
- node-cron (scheduler)
- zod (validation)

PC Agent:
- Python 3.10+
- flask (REST API)
- psutil (system metrics)
- sqlite3 (stdlib, local metrics DB)
- No heavy dependencies

## PHASE 1: SCAFFOLD

### Step 1.1: Create Next.js project

```bash
npx create-next-app@latest projectharbor --typescript --tailwind --app --src-dir --no-eslint
cd projectharbor
```

### Step 1.2: Install dependencies

```bash
# Core server
npm i better-sqlite3 drizzle-orm ssh2 ws node-cron multer zod uuid date-fns immer

# Types
npm i -D @types/better-sqlite3 @types/ssh2 @types/ws @types/multer @types/node-cron @types/uuid drizzle-kit tsx

# UI
npm i lucide-react recharts @codemirror/view @codemirror/state @codemirror/lang-python @codemirror/lang-json @codemirror/lang-markdown @codemirror/theme-one-dark @uiw/react-codemirror @xterm/xterm @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links react-hook-form @hookform/resolvers

# BUG FIX 14: Notebook output rendering (REQUIRED)
npm i isomorphic-dompurify anser
npm i -D @types/dompurify

# shadcn
npx shadcn@latest init -d
npx shadcn@latest add button card dialog input label select tabs textarea toast badge scroll-area progress tooltip popover dropdown-menu table command switch separator sheet
```

### Step 1.3: Directory structure

```bash
mkdir -p data logs scripts
mkdir -p src/server/{db,services,jobs,ssh,scheduler}
mkdir -p src/lib
mkdir -p src/hooks
mkdir -p src/components/{layout,project,dashboard,terminal,files,git,environment,jupyter,notebook,monitoring,scheduler,notes}
mkdir -p src/app/{projects,settings}
mkdir -p src/app/projects/\[projectId\]/{terminal,files,git,environment,jupyter,notebook,processes,schedules,notes,settings}
mkdir -p src/app/api/v1/{projects,notifications,app,proxy}
mkdir -p pc-agent
```

### Step 1.4: Create shared types

File: `src/types/index.ts`
— All TypeScript interfaces for Project, Job, SSHSession, Metric, Cell, NotebookDocument, etc.
— Export everything from here. All other files import from '@/types'.

### Step 1.5: Create server.ts (custom server)

File: `server.ts` (project root)
- HTTP server wrapping Next.js
- WebSocket upgrade handler routing:
  - `/ws/terminal/:projectId/:tab` → terminal handler
  - `/ws/metrics/:projectId` → metrics streaming
  - `/ws/kernel/:projectId` → Jupyter kernel relay (proxy WS to PC's Jupyter kernel)
- On startup: initialize DB, start scheduler, log "ProjectHarbor ready"
- On SIGTERM: close all SSH, close all WS, process.exit(0)

package.json scripts:
```json
{
  "dev": "tsx watch server.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

## PHASE 2: DATABASE

### Step 2.1: Schema

File: `src/server/db/schema.ts`

Tables (all with drizzle-orm definitions):

**projects** — id, name, slug, description, category, tags(JSON), status, is_pinned, health_score, created_at, updated_at, last_activity_at

**project_settings** — id, project_id(FK), key, value, updated_at. UNIQUE(project_id, key)

**jobs** — id, project_id(FK), job_type, status, label, input_json, result_json, error_message, idempotency_key(UNIQUE), created_at, started_at, completed_at, duration_ms

**job_logs** — id, job_id(FK), seq, level, message, metadata, created_at

**audit_events** — id, project_id, action, target_type, target_id, outcome, metadata, created_at

**ssh_sessions** — id, project_id(FK), machine_key, status, jupyter_status, jupyter_port, jupyter_pid, jupyter_session_start, connected_at, last_heartbeat, created_at. UNIQUE(project_id, machine_key)

**notebook_versions** — id, project_id(FK), git_commit_hash, git_commit_message, notebook_path, notebook_size, committed_at, pushed_at, is_milestone, milestone_label, created_at

**resource_metrics** — id, project_id(FK), machine_key, collected_at, cpu_percent, ram_percent, ram_used_gb, ram_total_gb, disk_json, gpu_percent, gpu_vram_percent, gpu_vram_used_gb, net_sent_kbps, net_recv_kbps, cpu_temp, jupyter_cpu_percent, jupyter_ram_mb. INDEX on (project_id, collected_at DESC)

**scheduled_tasks** — id, project_id(FK), name, task_type, enabled, cron_expression, interval_minutes, config_json, last_run_at, last_run_status, last_run_message, next_run_at, created_at, updated_at

**notifications** — id, project_id, type, title, message, severity, is_read, metadata, created_at

**journal_entries** — id, project_id(FK), content, is_pinned, created_at, updated_at

**todos** — id, project_id(FK), text, is_done, due_at, created_at, completed_at

**snippets** — id, project_id(FK), label, category, content, type, is_runnable, created_at

**file_bookmarks** — id, project_id(FK), path, label, source, created_at. UNIQUE(project_id, source, path)

**recent_files** — id, project_id(FK), path, source, accessed_at. UNIQUE(project_id, source, path)

**alert_thresholds** — id, project_id(FK), metric, threshold_value, comparison, enabled, cooldown_minutes, last_triggered_at, created_at. UNIQUE(project_id, metric)

**terminal_sessions** — id, project_id(FK), tab_index, label, status, history_json, created_at, last_activity

**process_watches** — id, project_id(FK), process_name, alert_on_start, alert_on_stop, is_pinned, last_seen_status, last_seen_at, created_at

**app_settings** — key(PK), value, updated_at

### Step 2.2: DB Client

File: `src/server/db/client.ts`
- Singleton better-sqlite3 instance
- Path: `./data/projectharbor.db`
- On init: enable WAL, enable FK
- Run drizzle migrations on startup
- Export: `db` instance and `drizzle` wrapper

## PHASE 3: SSH + SFTP

### Step 3.1: SSH Pool

File: `src/server/ssh/pool.ts`
- Map<string, ssh2.Client> keyed by projectId
- `getOrConnect(projectId)`: read SSH settings from project_settings, create Client
- Keepalive: 10s interval, 3 max count
- On 'close'/'error': update ssh_sessions, create notification, remove from map
- `exec(projectId, command, timeout?)`: execute command, return {stdout, stderr, code, ms}
- `closeAll()`: close everything
- `disconnect(projectId)`: close single

### Step 3.2: Command Allowlist

File: `src/server/ssh/commands.ts`
- Object mapping command keys to builder functions
- Every command is a function that takes typed params and returns a safe string
- `execAllowlisted(projectId, key, params)`: look up key, build command, call exec()
- Keys: all from WINDOWS_COMMANDS in the original spec (CPU_USAGE, RAM_USAGE, etc.)
- REJECT unknown keys with thrown error

### Step 3.3: SFTP Service

File: `src/server/ssh/sftp.ts`
- `getSftp(projectId)`: open SFTP channel from pooled SSH
- `listDir`, `readFile` (max 2MB), `writeFile`, `deleteFile`, `rename`, `mkdir`, `stat`
- `guardPath(projectDir, requestedPath)`: resolve path, ensure it starts with projectDir
- Throw PATH_TRAVERSAL_DENIED if guard fails

## PHASE 4: SERVICES

Create each service file with full implementation. Every service:
- Uses typed inputs/outputs
- Calls SSH pool or SFTP as needed
- Records audit events
- Creates job records for trackable operations

Files:
- `src/server/services/project.service.ts` — CRUD, duplicate, list with status
- `src/server/services/job.service.ts` — create, start, complete, fail, logs
- `src/server/services/audit.service.ts` — emit, list
- `src/server/services/git.service.ts` — all git operations via allowlisted commands
- `src/server/services/jupyter.service.ts` — start/stop via PC agent API, status, kernels
- `src/server/services/notebook.service.ts` — push/pull/backup/versions/restore
- `src/server/services/environment.service.ts` — discover, create, packages, freeze
- `src/server/services/file.service.ts` — wraps SFTP with audit + jobs
- `src/server/services/metrics.service.ts` — collect from PC agent API, store, query, cleanup
- `src/server/services/notification.service.ts` — CRUD, threshold checks
- `src/server/services/schedule.service.ts` — CRUD, run-now
- `src/server/services/journal.service.ts` — CRUD, FTS search
- `src/server/services/snippet.service.ts` — CRUD, run

**IMPORTANT for jupyter.service.ts**: In v2, Jupyter management goes through the PC Agent API, NOT direct SSH commands. The agent manages the Jupyter lifecycle.

**BUG FIX 16**: Add these keys to project_settings (missing from v1):
```typescript
// Additional SETTINGS_KEYS for v2 agent integration
'agent.port'    // "9111" — PC agent REST API port
'agent.apiKey'  // "xxx" — PC agent API key (generated on first agent run)
'agent.host'    // Usually same as ssh.host, but can differ
```

```typescript
// jupyter.service.ts - v2 approach
async function startJupyter(projectId: string) {
  const host = getProjectSetting(projectId, 'ssh.host');
  const agentPort = getProjectSetting(projectId, 'agent.port') || 9111;
  const resp = await fetch(`http://${host}:${agentPort}/jupyter/start`, { method: 'POST' });
  // ... handle response, update ssh_sessions
}

async function getJupyterStatus(projectId: string) {
  const host = getProjectSetting(projectId, 'ssh.host');
  const agentPort = getProjectSetting(projectId, 'agent.port') || 9111;
  const resp = await fetch(`http://${host}:${agentPort}/jupyter/status`);
  return resp.json();
}
```

## PHASE 5: API ROUTES

Implement all routes. Template pattern — create one route well, then replicate:

```typescript
// Template: src/app/api/v1/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';

export async function GET() {
  const start = Date.now();
  const projects = await projectService.listProjects();
  return NextResponse.json({
    data: projects,
    meta: { duration_ms: Date.now() - start }
  });
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = await projectService.createProject(parsed.data);
  return NextResponse.json({
    data: project,
    meta: { duration_ms: Date.now() - start }
  }, { status: 201 });
}
```

Route files — all from Part 8 of original spec PLUS:
- `src/app/api/v1/proxy/agent/[...path]/route.ts` — proxy to PC agent REST API
- `src/app/api/v1/proxy/jupyter/[...path]/route.ts` — proxy to Jupyter REST API

## PHASE 6: WEBSOCKET HANDLERS

### Terminal WebSocket (`/ws/terminal/:projectId/:tab`)

In `server.ts`:
- Parse projectId, tabIndex from URL
- Load project SSH settings
- Open SSH shell channel from pool
- Bidirectional pipe: client ↔ SSH shell
- Handle resize messages
- Save scrollback to terminal_sessions on disconnect

### Metrics WebSocket (`/ws/metrics/:projectId`)

- On connect: send latest metrics from PC agent
- Start polling PC agent `/metrics/latest` every 10s
- Broadcast to all connected clients for that project
- On disconnect: stop polling if no clients left

### Kernel Relay WebSocket (`/ws/kernel/:projectId`)

This is the critical one for the notebook UI:
- Client connects to `/ws/kernel/:projectId?notebook=path/to/notebook.ipynb`
- Server opens WS connection to PC's Jupyter kernel
- Bidirectional relay: all messages forwarded transparently
- Handle reconnection if Jupyter kernel restarts

**CRITICAL FIXES applied:**
- BUG FIX 11: notebookPath comes from client query string `?notebook=`
- BUG FIX 12: Match existing session by notebook path, don't just pick first
- BUG FIX 13: On connect, send kernel status so UI knows if cell is running
- Binary frame support for large outputs
- Reconnection logic with backoff

```typescript
// Kernel relay logic (in server.ts)
async function handleKernelUpgrade(ws: WebSocket, projectId: string, url: URL) {
  const notebookPath = url.searchParams.get('notebook');
  if (!notebookPath) {
    ws.send(JSON.stringify({ error: 'notebook query param required' }));
    ws.close(1008, 'Missing notebook path');
    return;
  }

  const host = getProjectSetting(projectId, 'ssh.host');
  const port = getProjectSetting(projectId, 'jupyter.port');
  const token = getProjectSetting(projectId, 'jupyter.token');

  // FIX BUG 12: Find session matching this specific notebook
  const sessionsResp = await fetch(`http://${host}:${port}/api/sessions`, {
    headers: { Authorization: `token ${token}` }
  });
  const sessions = await sessionsResp.json();
  let kernelId: string | null = null;

  // Look for existing session for this notebook
  const existingSession = sessions.find(
    (s: any) => s.path === notebookPath || s.notebook?.path === notebookPath
  );

  if (existingSession?.kernel?.id) {
    kernelId = existingSession.kernel.id;
    console.log(`Reusing existing kernel ${kernelId} for ${notebookPath}`);
  } else {
    // Create new session for this notebook
    const newSessionResp = await fetch(`http://${host}:${port}/api/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: notebookPath,
        name: notebookPath.split('/').pop(),
        type: 'notebook',
        kernel: { name: 'python3' }
      })
    });

    if (!newSessionResp.ok) {
      const err = await newSessionResp.text();
      ws.send(JSON.stringify({ error: `Failed to create kernel session: ${err}` }));
      ws.close(1011, 'Kernel session creation failed');
      return;
    }

    const sess = await newSessionResp.json();
    kernelId = sess.kernel.id;
    console.log(`Created new kernel ${kernelId} for ${notebookPath}`);
  }

  // Connect to Jupyter kernel WS
  // NOTE: Jupyter kernel WS uses token in query param, not Authorization header
  const jupyterWsUrl = `ws://${host}:${port}/api/kernels/${kernelId}/channels?token=${token}`;
  const jupyterWs = new WebSocket(jupyterWsUrl);

  let clientAlive = true;
  let jupyterAlive = false;

  jupyterWs.on('open', () => {
    jupyterAlive = true;
    // FIX BUG 13: Tell client the connection is ready + current kernel state
    ws.send(JSON.stringify({
      type: 'kernel_connected',
      kernelId,
      notebookPath
    }));
  });

  // Bidirectional relay — handle BOTH text and binary frames
  ws.on('message', (data, isBinary) => {
    if (jupyterAlive) {
      jupyterWs.send(data, { binary: isBinary });
    }
  });

  jupyterWs.on('message', (data, isBinary) => {
    if (clientAlive) {
      ws.send(data, { binary: isBinary });
    }
  });

  // Error handling
  jupyterWs.on('error', (err) => {
    console.error(`Jupyter kernel WS error for ${notebookPath}:`, err.message);
    if (clientAlive) {
      ws.send(JSON.stringify({
        type: 'kernel_error',
        error: err.message
      }));
    }
  });

  jupyterWs.on('close', (code, reason) => {
    jupyterAlive = false;
    if (clientAlive) {
      ws.send(JSON.stringify({
        type: 'kernel_disconnected',
        code,
        reason: reason.toString()
      }));
      // Don't close client WS — let frontend decide to reconnect
    }
  });

  ws.on('close', () => {
    clientAlive = false;
    // Don't close Jupyter WS — kernel stays alive for reconnection
    // Just clean up our relay
    if (jupyterAlive) {
      jupyterWs.close();
    }
  });

  ws.on('error', (err) => {
    console.error(`Client WS error:`, err.message);
    clientAlive = false;
  });
}
```

### Kernel Interrupt and Restart (REST API, NOT WebSocket)

```typescript
// These are proxied through the Jupyter proxy route
// POST /api/proxy/jupyter/api/kernels/{kernelId}/interrupt
// POST /api/proxy/jupyter/api/kernels/{kernelId}/restart

// In useKernel hook:
async function interruptKernel(kernelId: string) {
  await fetch(`/api/v1/proxy/jupyter/api/kernels/${kernelId}/interrupt`, {
    method: 'POST'
  });
  // Kernel will send status:idle via WS when interrupted
}

async function restartKernel(kernelId: string) {
  await fetch(`/api/v1/proxy/jupyter/api/kernels/${kernelId}/restart`, {
    method: 'POST'
  });
  // Kernel WS will close → relay sends 'kernel_disconnected'
  // Frontend should: clear all running cell states, reconnect WS
}
```

## PHASE 7: NOTEBOOK UI (MOST IMPORTANT FRONTEND)

### Step 7.1: Notebook Page

File: `src/app/projects/[projectId]/notebook/page.tsx`

This is the Colab-like UI. It must:
1. Load notebook content from Jupyter API (`/api/contents/{path}`) — includes ALL existing cell outputs
2. Parse .ipynb JSON into cell state (handle source as string OR string[])
3. Establish kernel WebSocket connection (with notebook path in query param)
4. Render cells with CodeMirror editors
5. Handle execution, output streaming, status updates
6. Save back to Jupyter on Ctrl+S
7. On reconnect: reload .ipynb from Jupyter API to get any outputs generated while disconnected

**BUG FIX 13 — State Recovery Flow:**
```
Browser opens → GET /api/contents/{notebook} → parse .ipynb → render cells WITH existing outputs
             → connect WS /ws/kernel/:projectId?notebook=path
             → receive 'kernel_connected' → show kernel status
             → if kernel was busy (running a cell), iopub will send status:busy immediately
             → user sees the kernel is active, can interrupt if needed
```

### Step 7.2: Notebook State Management

File: `src/hooks/useNotebook.ts`

```typescript
interface NotebookState {
  cells: Cell[];
  kernelStatus: 'idle' | 'busy' | 'starting' | 'dead' | 'reconnecting';
  dirty: boolean;  // unsaved changes
  activeCellId: string | null;
  executingCellIds: Set<string>;
}

interface Cell {
  id: string;
  type: 'code' | 'markdown' | 'raw';
  source: string;
  outputs: CellOutput[];
  executionCount: number | null;
  metadata: Record<string, any>;
  status: 'idle' | 'queued' | 'running' | 'done' | 'error';
  executionStartTime: number | null;
  collapsed: { input: boolean; output: boolean };
}

type CellOutput =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { output_type: 'execute_result'; data: MimeBundle; execution_count: number }
  | { output_type: 'display_data'; data: MimeBundle }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] };

type MimeBundle = {
  'text/plain'?: string;
  'text/html'?: string;
  'image/png'?: string;
  'image/svg+xml'?: string;
  'application/json'?: any;
};
```

### Step 7.3: Kernel WebSocket Hook

File: `src/hooks/useKernel.ts`

```typescript
function useKernel(projectId: string, notebookPath: string) {
  // Connect to /ws/kernel/:projectId?notebook=encodeURIComponent(notebookPath)
  // Track kernel status from 'status' messages on iopub channel
  // Route output messages to correct cell by parent_header.msg_id
  // Track kernelId (received from server's 'kernel_connected' message)
  //
  // Expose:
  //   execute(code, cellId) — sends execute_request on shell channel
  //   interrupt()           — POST /api/v1/proxy/jupyter/api/kernels/{id}/interrupt (REST!)
  //   restart()             — POST /api/v1/proxy/jupyter/api/kernels/{id}/restart  (REST!)
  //   status                — 'idle' | 'busy' | 'dead' | 'reconnecting'
  //   kernelId              — current kernel ID for REST calls
  //   isConnected           — WebSocket connected
  //   executionQueue        — CellExecutionQueue instance for Run All
  //
  // Message routing:
  //   On WS message, parse JSON:
  //     if msg.channel === 'iopub':
  //       if msg.msg_type === 'status': update kernelStatus
  //       if msg.msg_type === 'stream': append to cell output (find by parent_header.msg_id)
  //       if msg.msg_type === 'execute_result': set cell output
  //       if msg.msg_type === 'display_data': append to cell output
  //       if msg.msg_type === 'error': set cell error output
  //       if msg.msg_type === 'execute_input': set cell execution_count
  //       if msg.msg_type === 'clear_output': clear cell outputs
  //     if msg.channel === 'shell':
  //       if msg.msg_type === 'execute_reply': cell execution finished
  //         → mark cell done/error, notify executionQueue.onCellComplete(cellId)
  //
  // On 'kernel_disconnected' from server: set status='dead', offer reconnect
  // On 'kernel_connected' from server: set status='idle', store kernelId
  //
  // Reconnect logic:
  //   On WS close (unexpected): wait 2s, reconnect, resume
  //   On kernel restart (intentional): clear all cell states, reconnect WS
}
```

### Step 7.4: Cell Components

File: `src/components/notebook/Cell.tsx`

- Renders differently based on cell.type
- Code cell: CodeMirror editor with Python highlighting
- Markdown cell: rendered HTML (view mode) or CodeMirror (edit mode, double-click to edit)
- Active cell: highlighted left border
- Running cell: pulsing border + timer display
- Execution count: `[N]` in gutter, `[*]` while running

File: `src/components/notebook/CellOutput.tsx`

- Renders output based on output_type
- stream: pre-formatted text with ANSI color parsing
- execute_result / display_data: render best available MIME type
  - text/html: dangerouslySetInnerHTML (sanitized)
  - image/png: <img src="data:image/png;base64,..." />
  - text/plain: <pre>
- error: traceback lines with ANSI color, collapsible

File: `src/components/notebook/NotebookToolbar.tsx`

- Save, Run, Run All, Stop, Restart Kernel, Cell Type selector
- Kernel status indicator (colored dot + text)
- Connected/disconnected indicator

### Step 7.5: Notebook Keyboard Shortcuts

```
Shift+Enter     — Run cell, select next
Ctrl+Enter      — Run cell, stay
Alt+Enter       — Run cell, insert new below
Ctrl+S          — Save notebook
A (command mode) — Insert cell above
B (command mode) — Insert cell below
DD (command mode)— Delete cell
M (command mode) — Change to markdown
Y (command mode) — Change to code
Ctrl+Shift+H    — Toggle variable inspector
Escape          — Enter command mode
Enter           — Enter edit mode (on selected cell)
Up/Down         — Navigate cells (command mode)
```

## PHASE 8: DASHBOARD & MANAGEMENT UI

### Step 8.1: Layout Shell

File: `src/components/layout/AppShell.tsx`

- Collapsible sidebar (projects list + nav)
- Header with project name, status dots, notifications bell
- Main content area
- Command palette (Cmd+K)

### Step 8.2: Project List

File: `src/app/projects/page.tsx`

- List of projects with status indicators
- Pinned projects at top
- Each shows: SSH status, Jupyter status, last activity
- [+ New Project] button
- Search/filter

### Step 8.3: Project Dashboard

File: `src/app/projects/[projectId]/page.tsx`

Panels:
- Status row: CPU/RAM/GPU/Disk mini-cards
- Quick actions: Start/Stop Jupyter, Git Pull/Push, Open Notebook, Open Colab
- Metrics charts: CPU, RAM, GPU area charts (recharts)
- Recent jobs list
- Git status summary
- Jupyter session info

### Step 8.4: All Management Pages

Build each page under `src/app/projects/[projectId]/`:
- `/terminal` — xterm.js multi-tab terminal
- `/files` — SFTP file browser + CodeMirror editor
- `/git` — status, log, branches, diff, commit
- `/environment` — Python envs, packages, scripts
- `/jupyter` — session control, kernel management, Colab URL
- `/notebook` — THE COLAB UI (Phase 7)
- `/processes` — process list, kill, pin, watch
- `/schedules` — scheduled tasks CRUD
- `/notes` — journal, todos, snippets
- `/settings` — project settings editor

### Step 8.5: Project Wizard

File: `src/app/projects/new/page.tsx`

8-step wizard:
1. Name, description, category, tags
2. SSH connection (host, port, user, key) + test button
3. Project directories (remote paths) + create button
4. Git repo (clone URL or existing)
5. Python environment (discover + select/create)
6. Jupyter (port, token, auto-configure)
7. Notebook (filename, GitHub path, Colab URL)
8. Automation (scheduled tasks toggles)

## PHASE 9: PC AGENT

### Step 9.1: Agent Script

File: `pc-agent/agent.py`

Complete standalone Python script (~500 lines):
- Flask REST API on port 9111
- SQLite DB for metrics (local to PC)
- Jupyter watchdog thread (auto-restart on crash)
- Metrics collection thread (CPU, RAM, GPU, disk, network via psutil)
- Metrics cleanup (rolling 48h window)
- Process listing
- Git operations (subprocess calls)
- Config file management
- Logging to file

### Step 9.2: Agent Installer

File: `pc-agent/install.bat`

```batch
@echo off
echo Installing ProjectHarbor Agent...
pip install flask psutil
mkdir "%USERPROFILE%\projectharbor-agent"
copy agent.py "%USERPROFILE%\projectharbor-agent\"
copy config.json "%USERPROFILE%\projectharbor-agent\"
:: Create scheduled task to run on startup
schtasks /create /tn "ProjectHarborAgent" /tr "pythonw.exe \"%USERPROFILE%\projectharbor-agent\agent.py\"" /sc onstart /rl highest /f
echo Done. Agent will start on next boot.
echo Starting now...
start pythonw.exe "%USERPROFILE%\projectharbor-agent\agent.py"
```

### Step 9.3: Agent Config

File: `pc-agent/config.json`

```json
{
  "agent_port": 9111,
  "jupyter_port": 8888,
  "jupyter_token": "",
  "jupyter_env_path": "F:\\path\\to\\env",
  "jupyter_notebook_dir": "F:\\path\\to\\notebooks",
  "jupyter_watchdog": true,
  "metrics_interval_sec": 30,
  "metrics_retention_hours": 48,
  "bind_host": "0.0.0.0"
}
```

## PHASE 10: TESTING

### Compile check
```bash
npx tsc --noEmit
```

### API smoke tests
Create `tests/api.test.ts`:
- Create project → verify 201
- Get projects → verify array
- Update project → verify 200
- Delete project → verify 200
- SSH test connection (mock or skip if no PC)

### Notebook UI tests
Create `tests/notebook.test.ts`:
- Parse .ipynb JSON → cell state
- Serialize cells → valid .ipynb
- ANSI color parser
- MIME type prioritization

### Security tests
- Path traversal: `../../etc/passwd` → rejected
- Unknown command key → thrown error
- Token not in GET responses
- File size limit enforced

## PHASE 11: HARDENING

- Error boundaries on all pages
- Loading skeletons on all async panels
- Toast notifications on all actions (success/error)
- WebSocket reconnection with exponential backoff
- Graceful degradation when PC agent is unreachable
- Responsive layout (works on tablet for monitoring)
- Keyboard shortcuts help panel (? key)

## CSS DESIGN SYSTEM

File: `src/app/globals.css`

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');

:root {
  --bg-0: #0a0a0f;
  --bg-1: #12121a;
  --bg-2: #1a1a28;
  --bg-3: #242438;
  --bg-4: #2e2e48;
  --border-subtle: #1e1e30;
  --border-default: #2a2a42;
  --border-strong: #3a3a58;
  --text-0: #f0f0f5;
  --text-1: #b0b0c0;
  --text-2: #707088;
  --text-3: #484860;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-muted: rgba(99,102,241,0.12);
  --ok: #22c55e;
  --warn: #eab308;
  --err: #ef4444;
  --info: #3b82f6;
  --font-mono: 'JetBrains Mono', 'Menlo', monospace;
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --radius: 4px;
}

body {
  font-family: var(--font-mono);
  background: var(--bg-0);
  color: var(--text-0);
}

/* Override shadcn defaults */
.border { border-color: var(--border-default); }

/* Status dots */
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  display: inline-block;
}
.status-dot--ok { background: var(--ok); box-shadow: 0 0 4px var(--ok); }
.status-dot--warn { background: var(--warn); }
.status-dot--err { background: var(--err); }
.status-dot--idle { background: var(--text-3); }

/* Cell styles */
.cell { border-left: 3px solid transparent; }
.cell--active { border-left-color: var(--accent); }
.cell--running { border-left-color: var(--err); animation: pulse 1.5s infinite; }
@keyframes pulse {
  0%, 100% { border-left-color: var(--err); }
  50% { border-left-color: transparent; }
}
```

## FORBIDDEN PATTERNS

- No `child_process.exec()` with shell: true
- No `eval()` on user strings
- No tokens in logs or GET responses
- No `any` without comment
- No localStorage for sensitive data
- No raw stderr in API responses
- No SFTP without guardPath()
- No direct DB queries in React
- No file reads > 2MB without guard
```

---

## CONFIGURATION GUIDE (SEPARATE)

This section covers what you need to configure on your hardware.

### Windows PC Setup

1. **Install Tailscale**: Download from tailscale.com, sign in, note your PC's Tailscale IP (e.g., 100.111.151.48)

2. **Install Python 3.10+**: Ensure it's on PATH

3. **Install the ProjectHarbor Agent**:
   ```powershell
   # In PowerShell (as Administrator)
   pip install flask psutil
   mkdir $env:USERPROFILE\projectharbor-agent
   # Copy agent.py and config.json to this folder
   # Edit config.json with your paths
   ```

4. **Configure agent config.json**:
   ```json
   {
     "jupyter_env_path": "F:\\your\\venv\\path",
     "jupyter_notebook_dir": "F:\\your\\notebooks",
     "jupyter_port": 8888,
     "jupyter_token": "your_secure_token_here",
     "agent_port": 9111,
     "jupyter_watchdog": true,
     "metrics_interval_sec": 30,
     "bind_host": "0.0.0.0"
   }
   ```

5. **Install as auto-start service**:
   ```powershell
   # Option A: Task Scheduler (simpler)
   schtasks /create /tn "ProjectHarborAgent" /tr "pythonw.exe `"$env:USERPROFILE\projectharbor-agent\agent.py`"" /sc onstart /rl highest /f

   # Option B: NSSM (more reliable)
   # Download nssm from nssm.cc
   nssm install ProjectHarborAgent python.exe "$env:USERPROFILE\projectharbor-agent\agent.py"
   nssm set ProjectHarborAgent AppDirectory "$env:USERPROFILE\projectharbor-agent"
   nssm set ProjectHarborAgent Start SERVICE_AUTO_START
   nssm start ProjectHarborAgent
   ```

6. **SSH Setup** (if not done):
   ```powershell
   # Enable OpenSSH Server
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd
   Set-Service -Name sshd -StartupType Automatic
   # Copy your MacBook's public key to:
   # C:\Users\YourUser\.ssh\authorized_keys
   ```

7. **Firewall rules** (Tailscale handles most of this, but just in case):
   ```powershell
   # Allow agent port through firewall for Tailscale
   New-NetFirewallRule -DisplayName "ProjectHarbor Agent" -Direction Inbound -Protocol TCP -LocalPort 9111 -Action Allow -Profile Domain,Private
   # Allow Jupyter for Tailscale
   New-NetFirewallRule -DisplayName "Jupyter" -Direction Inbound -Protocol TCP -LocalPort 8888 -Action Allow -Profile Domain,Private
   ```

### MacBook Setup

1. **Install Tailscale**: Download from tailscale.com, sign in

2. **Install Node.js 20+**: `brew install node`

3. **Generate SSH key** (if not done):
   ```bash
   ssh-keygen -t ed25519 -C "projectharbor"
   # Copy public key to Windows PC's authorized_keys
   ```

4. **Test SSH connection**:
   ```bash
   ssh "ratul khan"@100.111.151.48
   ```

5. **Clone and start ProjectHarbor**:
   ```bash
   cd ~/projectharbor
   npm install
   npm run dev
   # Open http://localhost:3000
   ```

6. **Optional: Install as LaunchAgent** (auto-start on login):
   ```bash
   npm run install-service
   ```

### Claude Code Configuration

**Required extensions/plugins**: None special. Claude Code works with the terminal.

**Recommended Claude Code settings**:
```
# In your Claude Code CLAUDE.md or project instructions:
- Use tsx for running TypeScript files
- Use better-sqlite3 (not prisma, not pg)
- Use drizzle-orm for schema/queries
- Use ssh2 library for SSH (not child_process)
- Use ws library for WebSocket server
- All paths: use path.resolve, never string concat
- Test: npx tsc --noEmit after every major file
```

**Skills to use**: None required. This is a standard Next.js + Node.js project.

**MCP Servers**: Not needed for building. The project itself becomes the control plane.

### Verification Checklist

After build, verify:
- [ ] `npm run dev` starts without errors
- [ ] http://localhost:3000 loads project list
- [ ] Creating a project works (wizard)
- [ ] SSH connection to PC works (test button)
- [ ] Terminal opens and you get a PowerShell prompt
- [ ] PC agent responds at http://{PC_IP}:9111/health
- [ ] Jupyter status shows correctly
- [ ] Notebook UI loads .ipynb file with existing outputs
- [ ] Cell execution works (output appears)
- [ ] Save button works (shows Saving... → ✓ Saved)
- [ ] Ctrl+S saves notebook
- [ ] Autosave fires after 120s of inactivity with dirty changes
- [ ] Browser close while dirty shows "unsaved changes" warning
- [ ] Metrics charts show data
- [ ] File browser shows PC directories
- [ ] Git status/pull/push work
- [ ] Works in Chrome, Firefox, Safari, Brave
- [ ] Agent API key is required (401 without it)

### Cross-Browser Forbidden Patterns (client-side code only)

```
❌ crypto.randomUUID() — use uuid package's v4() instead
❌ structuredClone() — use JSON.parse(JSON.stringify()) or immer
❌ Array.at(-1) — use arr[arr.length - 1]
❌ Object.hasOwn() — use hasOwnProperty
❌ CSS :has() selector — use JS state
❌ CSS container queries — use media queries
❌ CSS gap in inline-flex — Safari 14 bug, use margin instead
❌ Top-level await in client components — wrap in useEffect
✓ new WebSocket() — works everywhere
✓ fetch() — works everywhere
✓ IntersectionObserver — works everywhere (Safari 12.1+)
✓ ResizeObserver — works everywhere (Safari 13.1+)
✓ CSS custom properties — works everywhere
✓ CSS flexbox gap — works everywhere (Safari 14.1+)
✓ CSS grid — works everywhere
```
