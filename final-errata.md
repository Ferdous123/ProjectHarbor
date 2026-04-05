# ProjectHarbor v2 — FINAL ERRATA & PRODUCTION ADDENDUM
# Apply these ON TOP of the existing spec files.
# This covers: save behavior, cross-browser, GitHub workflow, token optimization.

---

## E10: NOTEBOOK SAVE BEHAVIOR (explicit spec)

The notebook has THREE save mechanisms, matching Google Colab behavior:

### 1. Manual Save Button (visible in toolbar)
```
Toolbar: [💾 Save] [▶ Run] [⏭ Run All] [⏹ Stop] [🔄 Restart] | Cell Type ▾ | ● idle
                ↑
         Always visible. Shows state:
         - "Save" (normal, clickable)
         - "Saving..." (during save, spinner icon, disabled)
         - "✓ Saved" (after save, for 2 seconds, then back to "Save")
         - "⚠ Save failed" (on error, red, click to retry)
```

### 2. Ctrl+S / Cmd+S keyboard shortcut
Triggers identical save as button click.

### 3. Autosave (every 120s while dirty)
- Timer starts when `dirty=true` (any cell source changed)
- If no changes in 120s window, skip save
- On save: same API call, but no toast — just update "Last saved" in status bar
- Autosave does NOT run if a cell is currently executing (avoid saving mid-output)

### Save API call
```typescript
async function saveNotebook() {
  // 1. Serialize cells to .ipynb format
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: originalMetadata,  // PRESERVE from initial load — kernelspec, language_info
    cells: cells.map(cell => ({
      id: cell.id,  // nbformat 4.5+ requires cell IDs
      cell_type: cell.type,
      source: cell.source,  // string format
      metadata: cell.metadata,
      ...(cell.type === 'code' ? {
        outputs: cell.outputs,
        execution_count: cell.executionCount
      } : {})
    }))
  };

  // 2. PUT to Jupyter contents API
  const resp = await fetch(`/api/v1/proxy/jupyter/api/contents/${notebookPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: notebook,
      type: 'notebook',
      format: 'json'
    })
  });

  // 3. Handle conflicts
  if (resp.status === 409) {
    // File modified externally (e.g., from Colab simultaneously)
    // Show dialog: "File was modified externally. Overwrite or Reload?"
    throw new SaveConflictError();
  }

  if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);

  // 4. Update UI
  setDirty(false);
  setLastSaved(new Date());
}
```

### Dirty tracking
```typescript
// Mark dirty on ANY of these:
// - Cell source text changed (user typed in CodeMirror)
// - Cell added/deleted/moved
// - Cell type changed
// - Cell outputs cleared manually
// Do NOT mark dirty on:
// - Cell outputs arriving from kernel (these are in-memory only until save)
// - Cell status changes (running/idle)
// - Execution count updates
```

### Status bar save indicator
```
StatusBar: Python 3.11 | 42 cells | ● Connected | Last saved: 2 min ago | Ln 15, Col 8
                                                    ↑
                                            Updates on every save.
                                            Shows "Unsaved changes" in yellow if dirty.
                                            Shows "Last saved: just now" right after save.
```

### Unsaved changes guard
```typescript
// On browser close/navigate away while dirty:
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes.';
  }
});
```

---

## E11: CROSS-BROWSER COMPATIBILITY

### Safari-specific
```css
/* Prefix for backdrop-filter (command palette overlay, dialogs) */
.overlay-bg {
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

/* Safari needs explicit -webkit-scrollbar for custom scrollbars */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--bg-1); }
::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 4px; }
/* Firefox scrollbar */
* { scrollbar-width: thin; scrollbar-color: var(--bg-4) var(--bg-1); }
```

### Brave-specific
Brave Shields blocks third-party requests but same-origin is fine.
All WebSocket connections go to the same Next.js server (same origin), so Brave won't block them.
The proxy routes (`/api/v1/proxy/...`) are same-origin fetch calls — no issues.

### Mobile Safari (iPad/iPhone)
- CodeMirror 6 works on mobile but needs `inputMode="text"` for virtual keyboard
- Touch events for cell selection work natively with CodeMirror 6
- Long-press for context menu on cells
- Minimum touch target size: 44x44px for all buttons (Apple HIG)

### General cross-browser rules
- NO use of `crypto.randomUUID()` in client-side code — use `uuid` package instead
  (Safari 15.3 and older don't support it; uuid package works everywhere)
- NO `structuredClone()` in client code — use JSON parse/stringify or immer
- NO `Array.at()` — use bracket notation
- NO `Object.hasOwn()` — use `Object.prototype.hasOwnProperty.call()`
- NO CSS `container-queries` — use media queries
- NO CSS `:has()` selector — use JS state for conditional styling
- WebSocket: use standard `new WebSocket()` — works in all browsers
- Test with: Chrome 90+, Firefox 90+, Safari 15+, Brave latest, Edge 90+

### CSP headers (for production)
```typescript
// In Next.js middleware or server.ts:
// Allow WebSocket connections, inline styles (CodeMirror needs them),
// and blob URLs (for file downloads)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",  // CodeMirror needs eval for syntax highlighting
  "style-src 'self' 'unsafe-inline'",  // CodeMirror injects styles
  "img-src 'self' data: blob:",        // base64 images from notebook outputs
  "connect-src 'self' ws: wss:",       // WebSocket connections
  "font-src 'self' https://fonts.gstatic.com",
].join('; ');
```

---

## E12: ADDITIONAL PRODUCTION FIXES

### Fix 1: WebSocket reconnection (all WS handlers)
```typescript
// Every WebSocket connection (terminal, metrics, kernel) needs:
// 1. Heartbeat ping/pong (detect dead connections)
// 2. Exponential backoff reconnection
// 3. Visual indicator in UI ("Reconnecting..." overlay)

class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private maxAttempts = 10;

  connect(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { this.attempts = 0; this.onOpen?.(); };
    this.ws.onclose = (e) => {
      if (e.code !== 1000) this.reconnect(url);  // 1000 = normal close
      this.onClose?.(e);
    };
    this.ws.onerror = () => {};  // onclose fires after onerror
    this.ws.onmessage = (e) => this.onMessage?.(e);
  }

  reconnect(url: string) {
    if (this.attempts >= this.maxAttempts) { this.onMaxRetries?.(); return; }
    const delay = Math.min(1000 * Math.pow(2, this.attempts), 30000);
    this.attempts++;
    this.onReconnecting?.(this.attempts, delay);
    setTimeout(() => this.connect(url), delay);
  }

  send(data: any) { this.ws?.send(data); }
  close() { this.ws?.close(1000); }

  onOpen?: () => void;
  onClose?: (e: CloseEvent) => void;
  onMessage?: (e: MessageEvent) => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onMaxRetries?: () => void;
}
```

### Fix 2: API error wrapper (DRY for all routes)
```typescript
// src/lib/api-handler.ts — wrap all route handlers
export function apiHandler(fn: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const start = Date.now();
    try {
      return await fn(req);
    } catch (e: any) {
      console.error(`API error: ${req.method} ${req.url}`, e.message);
      const status = e.status || e.code === 'NOT_FOUND' ? 404 : 500;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status, headers: { 'X-Duration-Ms': String(Date.now() - start) } }
      );
    }
  };
}
```

### Fix 3: Proxy route must forward ALL HTTP methods
```typescript
// src/app/api/v1/proxy/jupyter/[...path]/route.ts
// Must export: GET, POST, PUT, PATCH, DELETE
// Jupyter API uses PUT for saving notebooks, POST for creating sessions,
// DELETE for shutting down kernels, etc.
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
```

### Fix 4: Notebook metadata preservation
```typescript
// When loading a notebook, PRESERVE the top-level metadata:
// { kernelspec: {...}, language_info: {...}, ... }
// This is needed for Jupyter to associate the notebook with the correct kernel.
// On save, merge back — don't overwrite with empty metadata.
const [notebookMetadata, setNotebookMetadata] = useState<any>(null);

function parseNotebook(ipynb: any): { cells: Cell[], metadata: any } {
  return {
    cells: ipynb.cells.map(parseCell),
    metadata: ipynb.metadata  // KEEP THIS
  };
}
```

### Fix 5: Error boundary with recovery
```typescript
// src/components/layout/ErrorBoundary.tsx
// Every page-level component should be wrapped.
// Show: "Something went wrong" + [Reload Page] + [Go to Dashboard] + error details (collapsed)
```

---

## GITHUB INTEGRATION WITH CLAUDE CODE

### Setup (one-time, 5 minutes)

**Step 1: Create GitHub repo**
```bash
# On GitHub.com: New Repository → "projectharbor" → Private → Create
# Or via gh CLI:
gh repo create projectharbor --private --source=. --remote=origin
```

**Step 2: Configure Claude Code for git**
Create `CLAUDE.md` in project root (Claude Code reads this automatically):

```markdown
# CLAUDE.md — Claude Code Project Instructions

## Git Workflow
After completing each PHASE, commit and push:
git add -A && git commit -m "Phase N: [description]" && git push origin main

## Branch Strategy
- `main` — stable, always buildable
- Create feature branches for risky changes: `git checkout -b phase-N`
- Merge to main after verification: `git checkout main && git merge phase-N`

## Verification Before Commit
Always run before committing:
npx tsc --noEmit && echo "✓ Types OK"

## Tech Stack
- Next.js 15, TypeScript, Tailwind, shadcn/ui
- better-sqlite3 + drizzle-orm
- ssh2 (never child_process)
- ws for WebSocket
- CodeMirror 6, xterm.js, recharts

## Key Rules
- All types in src/types/index.ts
- All services in src/server/services/
- All hooks in src/hooks/
- Validate inputs with Zod
- Sanitize HTML with DOMPurify
- guardPath() before every SFTP op
- Kernel interrupt/restart via REST, not WS
- Never expose tokens in GET responses
```

**Step 3: Initial commit**
```bash
cd projectharbor
git init
echo "node_modules/\ndata/\nlogs/\n.env.local\n*.db" > .gitignore
git add -A
git commit -m "Initial scaffold"
git remote add origin git@github.com:YOUR_USERNAME/projectharbor.git
git push -u origin main
```

**Step 4: Claude Code git commands**
Tell Claude Code at the START of each session:
```
"After completing this phase, run:
git add -A && git commit -m 'Phase N: description' && git push origin main
Verify npx tsc --noEmit passes before committing."
```

Claude Code has native git access — it can run git commands in the terminal.
No special plugins needed.

### Commit Convention
```
Phase 1: scaffold, deps, types, server.ts, CSS
Phase 2: database schema, migrations, seed
Phase 3: SSH pool, commands, SFTP
Phase 4: all services
Phase 5: API routes + proxy routes
Phase 6: WebSocket handlers (terminal, metrics, kernel relay)
Phase 7: layout shell, sidebar, header, navigation
Phase 8: dashboard, status cards, metric charts
Phase 9: notebook UI (colab-like)
Phase 10: terminal (xterm.js)
Phase 11: file browser + editor
Phase 12: git, env, jupyter, process, schedule, notes pages
Phase 13: project wizard
Phase 14: command palette, keyboard shortcuts, notifications, settings
Phase 15: testing, error boundaries, hardening
```

---

## TOKEN OPTIMIZATION MEASURES FOR CLAUDE CODE

### Strategy 1: CLAUDE.md file (saves ~2000 tokens per session)
The CLAUDE.md above tells Claude Code the rules once. Without it, you'd repeat
"use ssh2 not child_process" and "validate with Zod" every session.

### Strategy 2: Template-then-replicate pattern
```
Step A: "Create src/app/api/v1/projects/route.ts with GET and POST.
         Use Zod validation, try/catch, standard response shape."
Step B: "Now create these routes using the EXACT same pattern:
         - projects/[projectId]/route.ts (GET, PATCH, DELETE)
         - projects/[projectId]/settings/route.ts (GET, PUT)
         - projects/[projectId]/jobs/route.ts (GET, POST)
         - projects/[projectId]/git/route.ts (POST)
         ... [list all 30+ routes]"
```
Claude Code copies the pattern mechanically — 10x faster than describing each route.

### Strategy 3: Stub-first approach
```
"Create ALL service files as stubs with typed signatures and TODO comments.
 Don't implement yet — just export the function shapes."
```
Then in next session:
```
"Implement project.service.ts and job.service.ts fully."
```
This prevents back-and-forth import errors.

### Strategy 4: Batch similar work
Instead of:
```
"Create the git status component" → response → "Now create git log" → response → ...
```
Do:
```
"Create ALL components for the git page:
 - GitStatusPanel (modified/staged/untracked files, stage/unstage toggles)
 - GitLogTable (commit hash, message, author, date, pagination)
 - GitBranchList (local + remote, switch/create/delete)
 - GitDiffViewer (colored +/- lines, file-level expansion)
 - GitCommitForm (message input, staged file list, commit button)
 Put them all in src/components/git/. One file each, default export."
```

### Strategy 5: Reference existing files
```
"Look at src/components/notebook/CellOutput.tsx.
 Use the same pattern for src/components/terminal/TerminalOutput.tsx but with..."
```
Claude Code reads the file and matches the pattern — much less specification needed.

### Strategy 6: Avoid regeneration
If Claude Code makes a mistake in one function:
```
"In src/server/services/git.service.ts, the gitPull function is missing
 error handling for merge conflicts. Fix ONLY that function."
```
NOT: "Rewrite git.service.ts" — that regenerates 200 lines unnecessarily.

### Strategy 7: Combine phases when possible
Phases 3+4 (SSH + Services) can be done in one session.
Phases 10+11+12 (terminal + files + remaining pages) can be one session.
Only Phase 9 (notebook UI) deserves its own dedicated session.

### Estimated token budget per session
```
Phase 1+2:  ~15k tokens (scaffold + DB — mostly bash commands)
Phase 3+4:  ~40k tokens (SSH + all services — most code generation)
Phase 5:    ~25k tokens (API routes — repetitive, template-driven)
Phase 6:    ~20k tokens (WebSocket handlers — 3 handlers)
Phase 7+8:  ~30k tokens (layout + dashboard)
Phase 9:    ~50k tokens (notebook UI — most complex, give it room)
Phase 10-12: ~35k tokens (terminal + files + remaining pages)
Phase 13+14: ~20k tokens (wizard + global features)
Phase 15:   ~10k tokens (hardening)
Total: ~245k tokens across 7-9 sessions
```

---

## FINAL CHECKLIST (run before declaring "done")

### Functional
- [ ] Create project via wizard → all 8 steps work
- [ ] SSH connection → terminal opens, PowerShell prompt appears
- [ ] File browser → shows remote PC directories
- [ ] Open notebook → cells render with existing outputs
- [ ] Run cell → output appears (text, images, errors)
- [ ] Run All → cells execute sequentially with queue indicator
- [ ] Stop execution → cell stops, kernel goes idle
- [ ] Restart kernel → confirmation dialog → kernel restarts → cells clear
- [ ] Save notebook → Ctrl+S works, Save button works, autosave works
- [ ] Close browser, reopen → notebook reconnects, outputs still there
- [ ] Git pull/push/commit → works from UI
- [ ] Metrics charts → CPU/RAM/GPU update in real-time
- [ ] Agent down → graceful degradation, not crash
- [ ] Jupyter crash → watchdog restarts it within 15s

### Cross-browser
- [ ] Chrome: all features work
- [ ] Firefox: all features work
- [ ] Safari: WebSocket, CodeMirror, xterm.js work
- [ ] Brave: no Shield interference (all same-origin)
- [ ] Mobile Safari: notebook renders, can scroll cells (editing optional)

### Security
- [ ] Path traversal → 403
- [ ] Unknown command key → thrown error
- [ ] No tokens in GET responses
- [ ] HTML outputs sanitized
- [ ] Agent API key required

### Performance
- [ ] 100+ cell notebook → no freeze (may need lazy rendering)
- [ ] Metrics WS → stable at 10s interval for hours
- [ ] Terminal → no lag on keystroke
- [ ] File browser → directory listing < 2s
