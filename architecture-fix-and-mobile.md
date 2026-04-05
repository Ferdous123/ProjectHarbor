# ProjectHarbor v2 — Architecture Correction & Mobile UI

## ARCHITECTURE FIX: Everything on PC

### Previous (wrong)
```
PC: agent only
MacBook: Next.js web app ← WRONG: if MacBook off, no UI access
```

### Correct
```
PC: Next.js web app + agent + Jupyter + files + git — EVERYTHING
Any device: just a browser pointed at http://100.x.x.x:3000
```

### What this simplifies

1. **No SSH/SFTP needed for most operations**
   - Agent talks to web app via localhost:9111 (no Tailscale internally)
   - File operations use Node.js `fs` module (direct disk access)
   - Git operations use `child_process.execFile('git', ...)` locally
   - Terminal can use node-pty for local shell (no ssh2 needed)

2. **SSH/SFTP become OPTIONAL** — only needed if you later add a second machine

3. **Single install** — one `npm install` on PC, one `python agent.py`, done

4. **Always accessible** — PC is always on, any device connects via Tailscale

### Revised deployment

```bash
# On Windows PC:
# 1. Install Node.js 20+ (download from nodejs.org)
# 2. Install Tailscale
# 3. Clone/copy ProjectHarbor
cd C:\ProjectHarbor
npm install
npm run build

# 4. Install as Windows service (runs on boot)
# Use NSSM:
nssm install ProjectHarbor "C:\Program Files\nodejs\node.exe" "C:\ProjectHarbor\server.js"
nssm set ProjectHarbor AppDirectory "C:\ProjectHarbor"
nssm set ProjectHarbor Start SERVICE_AUTO_START
nssm start ProjectHarbor

# 5. Agent also runs as service (already set up)
# 6. Access from ANY device: http://100.x.x.x:3000
```

### What changes in the codebase

**File operations**: Replace SFTP calls with `fs.promises`:
```typescript
// Before (SFTP over SSH):
const content = await sftp.readFile(projectId, remotePath);

// After (local filesystem):
const content = await fs.promises.readFile(absolutePath, 'utf-8');
```

**Git operations**: Replace SSH exec with local child_process:
```typescript
// Before:
await sshPool.execAllowlisted(projectId, 'GIT_PULL', { dir });

// After:
const { stdout } = await execFile('git', ['pull'], { cwd: dir });
```

**Terminal**: Replace SSH shell with node-pty local shell:
```typescript
// npm install node-pty
import * as pty from 'node-pty';
const shell = pty.spawn('powershell.exe', [], { cwd: projectDir });
// WS ↔ shell bidirectional pipe (same as before, just no SSH)
```

**Jupyter proxy**: Goes to localhost instead of Tailscale IP:
```typescript
// Before: http://${pcHost}:${jupyterPort}/api/...
// After:  http://127.0.0.1:${jupyterPort}/api/...
```

**Agent API**: Goes to localhost:
```typescript
// Before: http://${agentHost}:${agentPort}/...
// After:  http://127.0.0.1:${agentPort}/...
```

### Keep SSH as optional module
Don't delete the SSH code — keep it as an optional "remote machine" mode for future
multi-machine support. But the PRIMARY path is local filesystem + local processes.

---

## MOBILE UI SPECIFICATION

### Design principles
1. **One-screen information density** — dashboard shows everything at a glance
2. **Tap-first** — every action is one tap, no hover states needed
3. **Blur non-functional** — features that don't work well on phone are visually dimmed
4. **Bottom navigation** — thumb-reachable, 4 tabs max
5. **No clutter** — if it's not useful on phone, hide it behind overflow menu

### Bottom navigation (always visible, 4 tabs)
```
[ ◉ Home ]  [ ◎ Notebook ]  [ ▤ Files ]  [ ⊞ Terminal ]
```
- Home = dashboard (metrics, quick actions, recent activity)
- Notebook = read/view notebook cells and outputs (editing optional)
- Files = file browser (sequential navigation)
- Terminal = shell (functional but not ideal on phone)

### Mobile dashboard layout (top to bottom)
```
┌─────────────────────────────────────┐
│ ☰  Thesis                      🔔2 │  ← hamburger + project name + notifications
├─────────────────────────────────────┤
│ [● Jupyter 2h14m] [● Agent] [● Git]│  ← horizontal scroll status pills
├──────────────┬──────────────────────┤
│  CPU    34%  │  RAM    67%         │  ← 2x2 metric cards with sparklines
│  ▁▃▂▅▃▇▃▅  │  ████████░░         │
├──────────────┼──────────────────────┤
│  GPU    12%  │  Disk   45%         │
│  VRAM 2.1/8 │  234/512 GB         │
├──────────────┴──────────────────────┤
│ [■ Stop]  [↓ Pull]  [↑ Push]      │  ← quick action grid (3 columns)
│ [◎ NB  ]  [⚡Push]  [▸ Files]     │
├─────────────────────────────────────┤
│ Recent                              │  ← last 3 jobs with status dots
│ ● git pull .................. 12s  │
│ ● jupyter start ............ 2h   │
│ ● notebook push ........... failed │
├─────────────────────────────────────┤
│ [◉ Home] [◎ NB] [▤ Files] [⊞ Term]│  ← bottom nav
└─────────────────────────────────────┘
```

### Mobile notebook view
```
┌─────────────────────────────────────┐
│ ←  thesis.ipynb    [▸] [■] [💾] [⋯]│  ← compact toolbar
├─────────────────────────────────────┤
│ ● Python 3.11 · idle · saved 2m    │  ← kernel status bar
├─────────────────────────────────────┤
│ [3] code                            │
│ ┌─────────────────────────────────┐ │
│ │ import numpy as np              │ │  ← code cell (read-only by default)
│ │ import matplotlib.pyplot as plt │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [4] code · 2.3s                     │  ← active cell (blue left border)
│ ┌─────────────────────────────────┐ │
│ │ data = np.load('train.npy')     │ │
│ │ print(data.shape)               │ │
│ └─────────────────────────────────┘ │
│ (10000, 128)                        │  ← output
├─────────────────────────────────────┤
│ ## Results                          │  ← rendered markdown
│ Training accuracy over 50 epochs    │
├─────────────────────────────────────┤
│ [5] code · 1.1s                     │
│ plt.plot(history['acc'])            │
│ ┌────────────────────────────┐      │
│ │     📈 (matplotlib plot)   │      │  ← image output, tap to fullscreen
│ └────────────────────────────┘      │
├─────────────────────────────────────┤
│        [ + code ]  [ + text ]       │  ← add cell
├─────────────────────────────────────┤
│ [◉ Home] [◎ NB] [▤ Files] [⊞ Term]│
└─────────────────────────────────────┘
```

### Feature blur/disable rules

**On mobile (viewport < 768px), these features are:**

FULLY FUNCTIONAL (no changes):
- Dashboard (metrics, status, quick actions)
- Jupyter start/stop/restart
- Git pull/push/commit
- Notebook viewing (cells + outputs)
- Running cells (tap play button)
- Stopping execution (tap stop)
- File browser (sequential navigation)
- Notifications
- Process list (view + kill)
- Project switching

AVAILABLE BUT DIMMED (show tooltip on tap explaining limitation):
- Code editing in cells — show: "Tap to edit. Virtual keyboard may be limited."
  Still functional, but CodeMirror on mobile is imperfect.
- Terminal — show tab with a subtle banner: "Terminal works best on desktop"
  Still functional, just not ideal.
- File editing — same dimmed treatment as code editing
- Git diff viewer — horizontal scroll warning

HIDDEN (moved to ⋯ overflow menu or removed):
- Variable inspector (desktop sidebar, not useful on phone)
- Table of contents sidebar
- Terminal split view
- Cell drag-and-drop reorder (use move up/down buttons instead)
- Keyboard shortcuts panel (no physical keyboard)
- Command palette (Cmd+K doesn't exist on phone)
- Multi-tab notebook view (use single notebook, switch via file browser)

DISABLED WITH EXPLANATION (grayed out + tap shows modal):
- None! Every feature either works or is hidden. No frustrating grayed-out buttons.

### Tap-to-edit notebook behavior on mobile
```
Default: cells are READ-ONLY (collapsed CodeMirror, no cursor)
Tap cell: show cell action bar [▸ Run] [✎ Edit] [▾ More]
Tap ✎ Edit: expand CodeMirror, show virtual keyboard
Tap outside cell or Done button: collapse back to read-only
```
This prevents accidental edits and keyboard popup when scrolling.

### Image output on mobile
- Tap image → fullscreen overlay with pinch-to-zoom
- Long press → share sheet (save to photos, copy)

### Error output on mobile
- Show last 3 lines of traceback
- Tap "Show full traceback" to expand
- Error name and value in red, always visible

### Responsive breakpoints (Tailwind)
```
Phone:  < 640px  (sm:)  — single column, bottom nav, compact
Tablet: 640-1024 (md:)  — 2 columns, bottom nav, more space
Desktop: > 1024  (lg:)  — full layout with sidebar

Use: className="hidden md:flex" for tablet+desktop only
Use: className="md:hidden" for phone only
Use: className="lg:hidden" for phone+tablet only
```

### Safe area handling (iPhone notch + home indicator)
```css
/* Apply to bottom nav and top header */
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
```

### Touch targets
All tappable elements: minimum 44x44px (Apple HIG).
All buttons: `touch-action: manipulation` (prevents double-tap zoom).
Cell action bar buttons: 48px height, well-spaced.

### Performance on mobile
- Lazy-render cells outside viewport (IntersectionObserver)
- Debounce metrics updates to 30s on mobile (save battery)
- No background WS reconnection attempts when app is backgrounded
  (Safari kills WS anyway; reconnect on foreground via Page Visibility API)
