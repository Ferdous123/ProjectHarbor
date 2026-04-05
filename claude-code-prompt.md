# CLAUDE CODE BUILD PROMPT — ProjectHarbor v2 (REVISED)
# Paste this entire file as a single prompt into Claude Code.
# This supersedes the previous version. All 19 identified bugs are addressed inline.

Read the file `projectharbor-v2-build.md` in this directory for the complete specification.
Then build ProjectHarbor following these phased instructions.
After each phase, run `npx tsc --noEmit` to verify no TypeScript errors before proceeding.

---

## ERRATA — CRITICAL ISSUES IN THE SPEC (read before building)

These were found during audit and are corrected in the updated spec file,
but listed here so you don't miss them:

### E1: Kernel protocol messages require ALL header fields
Every message to the Jupyter kernel must include: msg_id, session, username, date,
msg_type, version ("5.3"), AND a `channel` field ("shell"/"iopub"/"stdin"/"control").
Missing fields → kernel silently drops the message. No error, just nothing happens.

### E2: Kernel interrupt and restart are REST, NOT WebSocket
- Interrupt: `POST /api/kernels/{kernelId}/interrupt`
- Restart: `POST /api/kernels/{kernelId}/restart`
These go through the Jupyter proxy route. The useKernel hook calls fetch(), not ws.send().

### E3: Kernel relay needs notebook path from client
Client connects to: `/ws/kernel/:projectId?notebook=path/to/notebook.ipynb`
Server matches/creates a Jupyter session for THAT specific notebook.
Without this, multi-notebook tabs are impossible.

### E4: Watchdog race condition
When user manually stops Jupyter, the watchdog must NOT restart it.
The agent uses a `_manual_stop` flag. The UI can call `POST /jupyter/watchdog`
with `{"action": "resume"}` to re-enable watchdog after intentional stop.

### E5: HTML output sanitization is REQUIRED
All notebook HTML outputs (`text/html` MIME type) must be sanitized with DOMPurify
before rendering with dangerouslySetInnerHTML. Without this: XSS from malicious notebooks.

### E6: Agent auto-generates API key on first run
The PC agent creates a random API key on first startup and saves it to `API_KEY.txt`.
The ProjectHarbor web app must store this in project settings as `agent.apiKey` and send it
as `X-API-Key` header on all agent API calls.

### E7: Missing project settings keys
Add these to the settings schema:
- `agent.port` (default "9111")
- `agent.apiKey` (from agent's API_KEY.txt)
- `agent.host` (usually same as ssh.host)

### E8: Cell source format
.ipynb `cell.source` can be `string` OR `string[]`. Load converter:
`Array.isArray(source) ? source.join('') : source`. Save as string.

### E9: Missing npm dependencies
Must install: `isomorphic-dompurify` (HTML sanitization), `anser` (ANSI color parsing)
Plus types: `@types/dompurify`

---

## BUILD ORDER

### PHASE 1: Scaffold (do all at once)

1. Create Next.js project:
```bash
npx create-next-app@latest projectharbor --typescript --tailwind --app --src-dir --no-eslint
cd projectharbor
```

2. Install ALL dependencies:
```bash
# Core server
npm i better-sqlite3 drizzle-orm ssh2 ws node-cron multer zod uuid date-fns immer

# Types
npm i -D @types/better-sqlite3 @types/ssh2 @types/ws @types/multer @types/node-cron @types/uuid drizzle-kit tsx

# UI
npm i lucide-react recharts react-hook-form @hookform/resolvers
npm i @codemirror/view @codemirror/state @codemirror/lang-python @codemirror/lang-json @codemirror/lang-markdown @codemirror/theme-one-dark @uiw/react-codemirror
npm i @xterm/xterm @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links

# Notebook output rendering (E5, E9)
npm i isomorphic-dompurify anser
npm i -D @types/dompurify

# shadcn
npx shadcn@latest init -d
npx shadcn@latest add button card dialog input label select tabs textarea toast badge scroll-area progress tooltip popover dropdown-menu table command switch separator sheet
```

3. Create ALL directories:
```bash
mkdir -p data logs scripts pc-agent
mkdir -p src/server/{db,services,jobs,ssh,scheduler}
mkdir -p src/lib
mkdir -p src/hooks
mkdir -p src/components/{layout,project,dashboard,terminal,files,git,environment,jupyter,notebook,monitoring,scheduler,notes}
mkdir -p src/app/{projects,settings}
mkdir -p src/app/projects/new
mkdir -p src/app/projects/\[projectId\]/{terminal,files,git,environment,jupyter,notebook,processes,schedules,notes,settings}
mkdir -p src/app/api/v1/{projects,notifications,app}
mkdir -p src/app/api/v1/proxy/{agent,jupyter}
```

4. Create `src/types/index.ts` with ALL TypeScript interfaces.
IMPORTANT — include these (frequently referenced, easy to miss):

```typescript
// === Notebook Types (E1, E8) ===

export interface JupyterMessage {
  header: {
    msg_id: string;
    session: string;
    username: string;
    date: string;
    msg_type: string;
    version: '5.3';
  };
  parent_header: JupyterMessage['header'] | {};
  metadata: Record<string, any>;
  content: Record<string, any>;
  buffers: any[];
  channel: 'shell' | 'iopub' | 'stdin' | 'control';
}

export interface Cell {
  id: string;
  type: 'code' | 'markdown' | 'raw';
  source: string;  // always string internally; convert on load/save (E8)
  outputs: CellOutput[];
  executionCount: number | null;
  metadata: Record<string, any>;
  status: 'idle' | 'queued' | 'running' | 'done' | 'error';
  executionStartTime: number | null;
  collapsed: { input: boolean; output: boolean };
}

export type CellOutput =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { output_type: 'execute_result'; data: MimeBundle; execution_count: number; metadata: Record<string, any> }
  | { output_type: 'display_data'; data: MimeBundle; metadata: Record<string, any>; transient?: { display_id?: string } }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] };

export type MimeBundle = {
  'text/plain'?: string;
  'text/html'?: string;
  'image/png'?: string;
  'image/svg+xml'?: string;
  'image/jpeg'?: string;
  'application/json'?: any;
  'text/latex'?: string;
};

// .ipynb source field can be string or string[]
export function normalizeCellSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

// === Agent Types ===

export interface AgentHealth {
  status: string;
  uptime_sec: number;
  jupyter_running: boolean;
  jupyter_pid: number | null;
  jupyter_uptime_sec: number | null;
  hostname: string;
  agent_version: string;
  timestamp: number;
}

export interface AgentJupyterStatus {
  running: boolean;
  pid: number | null;
  port: number;
  uptime_sec: number | null;
  watchdog_enabled: boolean;
  manual_stop: boolean;  // E4: true = user stopped manually, watchdog paused
}

// === Kernel Relay Control Messages (from server.ts to client) ===

export type KernelRelayMessage =
  | { type: 'kernel_connected'; kernelId: string; notebookPath: string }
  | { type: 'kernel_disconnected'; code: number; reason: string }
  | { type: 'kernel_error'; error: string };
```

5. Create `server.ts` (project root) — custom Node.js HTTP server:
```
- import http, next, ws, url
- Create http.createServer(nextHandler)
- On 'upgrade': parse URL pathname
  - /ws/terminal/:projectId/:tab  → terminal handler
  - /ws/metrics/:projectId        → metrics handler
  - /ws/kernel/:projectId         → kernel relay handler (reads ?notebook= query param) (E3)
  - else: reject upgrade
- On startup: init DB, start scheduler
- On SIGTERM: close all SSH, close all WS, process.exit(0)
```

6. Create `src/app/globals.css` — design system from spec (deep navy palette, JetBrains Mono).
Also include ANSI color classes for notebook outputs:
```css
/* ANSI color classes for cell output (used by anser library with use_classes:true) */
.ansi-black-fg { color: #3e3d32; }
.ansi-red-fg { color: #f85149; }
.ansi-green-fg { color: #3fb950; }
.ansi-yellow-fg { color: #d29922; }
.ansi-blue-fg { color: #388bfd; }
.ansi-magenta-fg { color: #bc8cff; }
.ansi-cyan-fg { color: #76e4f7; }
.ansi-white-fg { color: #e6edf3; }
.ansi-bright-black-fg { color: #636e7b; }
.ansi-bright-red-fg { color: #ff7b72; }
.ansi-bright-green-fg { color: #56d364; }
.ansi-bright-yellow-fg { color: #e3b341; }
.ansi-bright-blue-fg { color: #79c0ff; }
.ansi-bright-magenta-fg { color: #d2a8ff; }
.ansi-bright-cyan-fg { color: #a5d6ff; }
.ansi-bright-white-fg { color: #f0f0f5; }
.ansi-bold { font-weight: 700; }
```

7. Create `tailwind.config.ts` with color palette from spec.

8. Update `package.json` scripts:
```json
"dev": "tsx watch server.ts",
"build": "next build",
"start": "NODE_ENV=production tsx server.ts",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

9. Run `npx tsc --noEmit` — fix any errors.

### PHASE 2: Database
1. Create `drizzle.config.ts`
2. Create `src/server/db/schema.ts` — ALL tables from spec.
   IMPORTANT: Include `agent.port`, `agent.apiKey`, `agent.host` as valid setting keys (E7).
3. Create `src/server/db/client.ts` — singleton, WAL mode, FK enforcement.
4. Run migrations.
5. Create `src/server/db/seed.ts` for default app_settings.
6. Verify: `npx tsc --noEmit`

### PHASE 3: SSH + SFTP
1. Create `src/server/ssh/pool.ts`
2. Create `src/server/ssh/commands.ts` — all Windows commands
3. Create `src/server/ssh/sftp.ts` — with guardPath() on EVERY operation
4. Verify: `npx tsc --noEmit`

### PHASE 4: Services

Create each service. Key notes per service:

**jupyter.service.ts** — Calls PC agent REST API, NOT SSH. Must:
- Include agent API key in X-API-Key header on all requests (E6)
- Call `http://{agentHost}:{agentPort}/jupyter/start|stop|status`
- Handle agent unreachable gracefully (agent down ≠ jupyter down)
- NOT use the SSH pool for Jupyter management

**notebook.service.ts** — Push/pull via git (SSH), NOT via agent.
- Uses SFTP to read .ipynb for git commit
- Handles source format on read (E8)

**metrics.service.ts** — Reads from PC agent `/metrics` endpoint, stores in local DB.
- On connect: bulk-fetch historical metrics from agent (`?hours=48`)
- Then poll `/metrics/latest` every 10s
- Include X-API-Key header (E6)

Build in this order:
1. project.service.ts
2. job.service.ts + audit.service.ts
3. git.service.ts
4. jupyter.service.ts (agent API calls)
5. notebook.service.ts
6. environment.service.ts
7. file.service.ts
8. metrics.service.ts
9. notification.service.ts
10. schedule.service.ts
11. journal.service.ts + snippet.service.ts

Verify: `npx tsc --noEmit`

### PHASE 5: API Routes

Template pattern — create one perfect route, replicate:
```typescript
// src/app/api/v1/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';

export async function GET() {
  const start = Date.now();
  try {
    const projects = await projectService.listProjects();
    return NextResponse.json({ data: projects, meta: { ms: Date.now() - start } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

Create ALL routes from spec. ALSO create these proxy routes:

**`src/app/api/v1/proxy/agent/[...path]/route.ts`**
- Proxies GET/POST/PUT/DELETE to PC agent REST API
- Reads `agent.host`, `agent.port`, `agent.apiKey` from project settings
- Adds `X-API-Key` header (E6)
- Handles agent down gracefully (504 Gateway Timeout)

**`src/app/api/v1/proxy/jupyter/[...path]/route.ts`**
- Proxies to Jupyter REST API on PC
- Adds `Authorization: token {jupyter.token}` header
- CRITICAL for notebook operations: save, load, kernel interrupt/restart (E2)
- Must handle both GET and POST methods
- Path example: client calls `/api/v1/proxy/jupyter/api/kernels/{id}/interrupt`
  → server calls `http://{pcHost}:{jupyterPort}/api/kernels/{id}/interrupt`

Verify: `npx tsc --noEmit`

### PHASE 6: WebSocket Handlers

Fill in the stubs in server.ts:

**1. Terminal handler** (`/ws/terminal/:projectId/:tab`)
- Open SSH shell channel from pool
- Bidirectional pipe: client ↔ SSH shell
- Handle `{type:'resize', cols, rows}` messages
- Save scrollback on disconnect

**2. Metrics handler** (`/ws/metrics/:projectId`)
- On connect: fetch `/metrics?hours=1` from agent, send all
- Poll agent `/metrics/latest` every 10s
- Broadcast to all clients for that project
- Include X-API-Key in agent requests (E6)

**3. Kernel relay handler** (`/ws/kernel/:projectId?notebook=...`) — MOST CRITICAL

Read the corrected implementation in `projectharbor-v2-build.md` carefully.
Key points that differ from naive implementation:
- Parse `notebook` from URL query params (E3)
- Match existing Jupyter session by notebook path, not just `sessions[0]`
- Create new session only if no match found
- Use `?token=` in Jupyter kernel WS URL (not Authorization header — Jupyter WS doesn't support it)
- Relay both text AND binary frames
- Send `{type:'kernel_connected', kernelId}` to client on success
- Send `{type:'kernel_disconnected'}` on Jupyter WS close — DON'T close client WS
- Send `{type:'kernel_error'}` on Jupyter WS error
- Client WS close → close Jupyter WS (cleanup relay, but kernel stays alive)

Verify: `npx tsc --noEmit`

### PHASE 7: Frontend — Layout + Navigation
1. `src/components/layout/AppShell.tsx` — sidebar + header + main content
2. `src/components/layout/Sidebar.tsx` — project list with status dots + nav links
3. `src/components/layout/Header.tsx` — project name, status badges, notifications bell
4. `src/components/layout/CommandPalette.tsx` — Cmd+K fuzzy search
5. `src/app/layout.tsx` — wrap with AppShell
6. `src/app/projects/page.tsx` — project list
7. `src/app/projects/[projectId]/layout.tsx` — sub-layout with sidebar nav
8. Verify: `npm run dev` loads without errors

### PHASE 8: Frontend — Dashboard
1. `src/app/projects/[projectId]/page.tsx` — main dashboard
2. Dashboard components:
   - StatusRow (CPU/RAM/GPU/Disk mini-cards with sparklines)
   - QuickActions (button grid for common operations)
   - MetricCharts (recharts AreaChart for CPU, RAM, GPU)
   - JobList (recent jobs, expandable to show logs)
   - GitStatusPanel (branch, modified files, commit form)
   - JupyterPanel (status, start/stop, session timer, watchdog state)
3. Hooks: `useProjectStatus`, `useMetricsStream`, `useJobs`
4. Verify: renders without crash

### PHASE 9: Frontend — Notebook UI (MOST CRITICAL PHASE)

This is the Colab-like notebook interface. Build carefully. Read `projectharbor-v2-build.md`
section "COMPONENT 2: COLAB-LIKE NOTEBOOK UI" in full before starting.

**9.1** `src/lib/notebook-utils.ts` — utility functions:
- `normalizeCellSource(source: string | string[]): string` (E8)
- `parseNotebook(ipynb: any): Cell[]` — parse .ipynb JSON to Cell[]
- `serializeNotebook(cells: Cell[], metadata: any): object` — serialize back to .ipynb
- `createJupyterMessage(type: string, content: object, session: string): JupyterMessage` (E1)
  This MUST include all header fields: msg_id, session, username, date, msg_type, version
- `sanitizeHtml(html: string): string` — DOMPurify wrapper (E5)
- `ansiToHtml(text: string): string` — Anser wrapper for ANSI colors
- `getMimeTypePreference(data: MimeBundle): string` — priority: html > image > latex > plain
- Cell ID generator (for new cells)

**9.2** `src/hooks/useNotebook.ts` — notebook state management:
- Load notebook from Jupyter API: GET `/api/v1/proxy/jupyter/api/contents/{path}`
- Parse with `parseNotebook()` — this loads ALL existing outputs (state recovery)
- Track dirty state, active cell, collapsed state
- Cell operations: add, delete, move, change type, update source
- Autosave: debounced save every 60s if dirty (PUT to Jupyter contents API)
- Ctrl+S: immediate save

**9.3** `src/hooks/useKernel.ts` — kernel WebSocket + message routing:
- Connect to `/ws/kernel/:projectId?notebook=encodeURIComponent(path)` (E3)
- Generate a `sessionId` once per connection (used in all message headers)
- On message from server:
  - `{type:'kernel_connected'}` → store kernelId, set status='idle'
  - `{type:'kernel_disconnected'}` → set status='dead', offer reconnect button
  - `{type:'kernel_error'}` → show error toast
  - Otherwise: parse as JupyterMessage:
    - `channel=iopub, msg_type=status` → update kernelStatus (idle/busy)
    - `channel=iopub, msg_type=stream` → append to cell output (match by parent_header.msg_id)
    - `channel=iopub, msg_type=execute_result` → set cell output
    - `channel=iopub, msg_type=display_data` → append to cell output
    - `channel=iopub, msg_type=error` → set cell error output, mark cell as error
    - `channel=iopub, msg_type=execute_input` → set cell executionCount
    - `channel=iopub, msg_type=clear_output` → clear cell outputs
    - `channel=shell, msg_type=execute_reply` → cell finished, notify queue
- Expose:
  - `execute(code, cellId)` — send execute_request on shell channel (E1 full format)
  - `interrupt()` — POST to Jupyter proxy: `/api/kernels/{kernelId}/interrupt` (E2)
  - `restart()` — POST to Jupyter proxy: `/api/kernels/{kernelId}/restart` (E2)
    → on restart: clear all running cells, reconnect WS
  - `status` — kernel status
  - `kernelId` — for REST calls
  - `isConnected` — WS connected
- Execution queue: `CellExecutionQueue` class (run all sends cells sequentially)
- Reconnect with exponential backoff on unexpected WS close
- Map msg_id → cellId for routing outputs to correct cells

**9.4** `src/components/notebook/CellOutput.tsx` — ALL output type rendering:
- `stream`: pre-formatted text. Use `ansiToHtml()` for ANSI colors.
  Merge consecutive stdout streams into one block.
  Separate stderr with red-tinted background.
- `execute_result` / `display_data`: render best MIME type using priority:
  `text/html` → sanitize with DOMPurify (E5), render with dangerouslySetInnerHTML
  `image/png` → `<img src="data:image/png;base64,{data}" />`
  `image/svg+xml` → sanitize with DOMPurify, render inline
  `text/plain` → `<pre>` fallback
- `error`: render traceback lines with ANSI color parsing.
  Collapsible (show last 3 lines, expand for full).
  Highlight error name and value.

**9.5** `src/components/notebook/Cell.tsx` — cell container:
- Code cell: CodeMirror 6 with Python, bracket matching, auto-indent
- Markdown cell: dual mode — rendered HTML (view) or CodeMirror (edit, double-click)
- Active cell: left border highlight
- Running cell: pulsing red left border + timer
- Execution count: `[N]` in gutter, `[*]` while running, `[ ]` for never-run

**9.6** Other notebook components:
- `NotebookToolbar.tsx` — Save, Run, Run All, Stop (interrupt via REST E2), Restart Kernel,
  Cell Type selector, Kernel status dot, Connected indicator
- `CellGutter.tsx` — execution count, play button, cell menu
- `VariableInspector.tsx` — uses silent kernel execution to introspect variables
- `NotebookStatusBar.tsx` — kernel name, cell count, connection, last saved
- `TableOfContents.tsx` — auto-generated from markdown headings

**9.7** `src/app/projects/[projectId]/notebook/page.tsx` — assemble everything:
- On mount: load notebook via useNotebook, connect kernel via useKernel
- Show loading state while notebook loads
- Show connection state while kernel connects
- After both ready: render cells with full interactivity
- On unmount: don't kill kernel (persists for reconnection)

**9.8** Keyboard shortcuts (implement in notebook page):
```
Shift+Enter     → run cell, select next
Ctrl+Enter      → run cell, stay
Alt+Enter       → run cell, insert new below
Ctrl+S          → save notebook
Escape          → command mode (focus leaves editor)
Enter           → edit mode (focus enters editor)
A (command mode) → insert cell above
B (command mode) → insert cell below
DD (command mode)→ delete cell (double-tap D)
M (command mode) → change to markdown
Y (command mode) → change to code
Up/Down (cmd)    → navigate cells
Ctrl+Shift+H    → toggle variable inspector
```

Test: load a real .ipynb, run `print("hello")`, see output. Run a matplotlib plot, see image.

### PHASE 10: Frontend — Terminal
1. `src/components/terminal/TerminalPane.tsx` — xterm.js + WS
2. `src/components/terminal/TerminalTabs.tsx` — multi-tab
3. `src/app/projects/[projectId]/terminal/page.tsx`
4. Quick-paste snippets row at top

### PHASE 11: Frontend — File Browser
1. `src/components/files/FileTree.tsx` — SFTP directory listing, lazy-load children
2. `src/components/files/FileViewer.tsx` — syntax highlight read-only
3. `src/components/files/FileEditor.tsx` — CodeMirror with save (SFTP write)
4. `src/app/projects/[projectId]/files/page.tsx` — split pane tree + viewer

### PHASE 12: Frontend — Remaining Pages
Build each (simpler pages, follow patterns from dashboard/notebook):
1. `/git` — status, log, branches, commit, diff viewer
2. `/environment` — Python envs, packages, install/uninstall
3. `/jupyter` — session control, kernel management, watchdog status (E4),
   Colab URL construction, agent event history
4. `/processes` — process list from agent, kill, pin, watch
5. `/schedules` — CRUD for scheduled tasks
6. `/notes` — journal (markdown), todos (checkbox), snippets (runnable)
7. `/settings` — project settings form INCLUDING agent config section (E7)

### PHASE 13: Frontend — Project Wizard
Create `src/app/projects/new/page.tsx` — 8-step wizard:

1. **Identity**: Name, description, category, tags
2. **Remote Machine**: Host, port, username, SSH key path + [Test Connection]
   ALSO: Agent port (default 9111), Agent API key + [Test Agent] button (E7)
3. **Directories**: Remote project dir + sub-directory toggles + [Create All]
4. **Git**: Clone URL / existing / init
5. **Python Environment**: [Discover] → select/create
6. **Jupyter**: Port, token, auto-configure. Agent manages lifecycle.
7. **Notebook**: Filename, GitHub path, Colab URL override, auto-push settings
8. **Automation**: Scheduled tasks toggles

### PHASE 14: Frontend — Global Features
1. Command palette (Cmd+K) — fuzzy search projects, actions, navigation
2. Keyboard shortcuts help panel (? key)
3. Notifications bell + slide-in panel
4. App settings page (`/settings`) — theme, font size, monitoring intervals
5. Toast notifications on all async actions (success/error)

### PHASE 15: Testing + Hardening
1. `npx tsc --noEmit` — fix ALL type errors
2. Test each page loads without crash
3. Error boundaries on all page-level components
4. Loading skeletons on all async panels (SWR/fetch states)
5. WebSocket reconnection — close browser tab, reopen, verify reconnects
6. Notebook flow: load → run cell → see output → save → reload → outputs persist
7. Path traversal: send `../../etc/passwd` via API → verify 403
8. Command allowlist: send unknown key → verify thrown error
9. Agent down: access dashboard with agent offline → verify graceful degradation
10. Large notebook: open 100+ cell notebook → verify no freeze
11. Token masking: verify no API GET response contains raw jupyter token or agent apiKey

---

## CRITICAL RULES (do not violate)

- NEVER use `child_process` for SSH — always `ssh2` library
- NEVER expose tokens/apiKeys in GET responses or console.log
- ALWAYS use `guardPath()` before SFTP operations
- ALWAYS validate API inputs with Zod
- ALWAYS sanitize HTML outputs with DOMPurify before dangerouslySetInnerHTML (E5)
- ALWAYS include all 7 header fields in Jupyter kernel messages (E1)
- ALWAYS send kernel interrupt/restart via REST, not WebSocket (E2)
- Use `@/` path alias for all imports
- One component per file, default export
- All hooks in `src/hooks/`
- All services in `src/server/services/`
- Keep components under 300 lines — split if larger

## TOKEN CONSERVATION FOR CLAUDE CODE

- Create `src/types/index.ts` FIRST — all files reference same types
- Create ONE perfect API route, then replicate pattern for all others
- Create ONE perfect service, then replicate pattern
- Don't regenerate working code — use str_replace for targeted edits
- Batch similar files: all git routes in one pass, all jupyter routes in one pass
- Use index.ts barrel exports to avoid import path churn
- Test with `npx tsc --noEmit` after each PHASE, not after each file
- For notebook components: build CellOutput first (most complex), then Cell wraps it,
  then NotebookPage assembles — avoids back-and-forth

## HOW TO FEED THIS TO CLAUDE CODE

Don't paste the entire build spec at once. Feed phase by phase:

```
Session 1: "Read projectharbor-v2-build.md. Do PHASE 1 and PHASE 2."
Session 2: "Continue with PHASE 3 and PHASE 4."
Session 3: "Do PHASE 5 and PHASE 6. Read the kernel relay section VERY carefully."
Session 4: "Do PHASE 7 and PHASE 8."
Session 5: "Do PHASE 9 — the notebook UI. This is the hardest phase. Take your time.
            Read the kernel protocol and errata sections carefully.
            Build notebook-utils.ts first, then useKernel, then CellOutput, then Cell.
            Test with npx tsc --noEmit."
Session 6: "Do PHASE 10, 11, 12."
Session 7: "Do PHASE 13, 14, 15."
```

After each session, commit to git: `git add -A && git commit -m "Phase N complete"`
