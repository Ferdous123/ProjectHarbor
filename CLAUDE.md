# ProjectHarbor — Memory Bank

## Architecture
- Everything runs on Windows PC (web app + agent + Jupyter)
- Access from any device via Tailscale
- Web app: Next.js, custom server.ts, WebSocket handlers, port 3000
- Agent: Python Flask, port 9111, manages Jupyter + metrics
- Jupyter: managed by agent, port 8888, kernel protocol v5.3

## Tech Stack
- Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui
- better-sqlite3 + drizzle-orm (local SQLite)
- ws (WebSocket), node-pty (terminal), node-cron (scheduler)
- CodeMirror 6, xterm.js, recharts
- isomorphic-dompurify (HTML sanitization), anser (ANSI colors)

## Key rules (NEVER violate)
- Secrets only in .env (gitignored)
- Per-project settings in DB (project_settings table) — NOT .env
- Kernel interrupt/restart = REST calls, NOT WebSocket
- All kernel messages need ALL 7 header fields
- DOMPurify on ALL dangerouslySetInnerHTML
- Path validation on ALL fs operations (use guardPath from @/lib/guard-path)
- uuid package for IDs (not crypto.randomUUID)
- No process.env for per-project config
- .env has ONLY: GITHUB_TOKEN, GITHUB_USERNAME, AGENT_PORT, AGENT_API_KEY, PORT, NODE_ENV
- Jupyter config (token, port, env_path, notebook_dir) → agent config.json ONLY

## User Paths
```
Python:       F:\Python311\python.exe
Venv:         F:\Research_Paper_Projects\Thesis\physicsdp_env
Notebooks:    F:\Research_Paper_Projects\Thesis
ProjectHarbor:   F:\Research_Paper_Projects\ProjectHarbor
Agent:        F:\Research_Paper_Projects\ProjectHarbor\pc-agent
Agent API:    http://127.0.0.1:9111  (X-API-Key header required)
Jupyter:      http://127.0.0.1:8888  (token auth)
GitHub:       username = Ferdous123
```

## Current state
- Phase 1-15 + L1/L2/L3: Complete, 0 TS errors, clean build
- Last audit: 2026-04-07 (comprehensive hardening pass + file browser enhancements)
- TypeScript: 0 errors
- Build: Clean

## Completed this session (2026-04-07 hardening pass)
- Fixed .env to system-level only (GITHUB_TOKEN, GITHUB_USERNAME, AGENT_PORT, AGENT_API_KEY, PORT, NODE_ENV)
- Added GITHUB_USERNAME=Ferdous123 to .env
- Updated config.json to include jupyter settings (moved from .env)
- Fixed agent.py load_config() to read jupyter config from config.json, NOT .env
- Added requests import to agent.py
- Fixed agent.py get_db() with PRAGMA synchronous=NORMAL and wal_checkpoint
- Fixed Jupyter start command with websocket ping interval/timeout flags
- Added KernelHealthMonitor thread to agent.py
- Added startup_recovery() to agent.py (cleans stale PID, Jupyter runtime files)
- Added kernel API endpoints to agent.py (list/restart/interrupt kernels)
- Added graceful shutdown handler to agent.py (atexit + signal handlers)
- Added save_config() to persist jupyter settings to config.json
- Added kernel WS relay heartbeat (15s ping, 30s timeout, auto-reconnect)
- Added kernel_reconnecting message type to KernelRelayMessage
- Added auto-reconnect with MAX_RECONNECT_ATTEMPTS=5 to kernel relay
- Added getSqlite() export to db client
- Added crash recovery to server.ts startup (cleans stale jobs/sessions/connections)
- Added WAL checkpoint to server.ts graceful shutdown
- Created useAgentConnection hook (polls /api/v1/proxy/agent/health every 10s)
- Created AgentBanner component (shows "agent offline" yellow banner)
- Added AgentBanner to dashboard page
- Created sanitizeWindowsName() and sanitizeGitHubRepoName() in @/lib/utils
- Created github.service.ts with full GitHub API (CRUD, contents, branches, commits)
- Created GitHub API routes (/api/v1/github/repos/...)
- Created GitHub page (/github) with repo list, browse, create, delete, clear
- Added GitHub link button to projects list page
- Added training progress detection (F1) to CellOutput component
- Added output truncation guard (F12) to CellOutput (>100 lines)
- Added stuck kernel detection (A4) - shows Interrupt/Restart after 60s busy
- Added notebook backup save (K4) - writes .harbor-backup after each save
- Added notebook checkpoint (F8) - git commit + tag via toolbar button
- Added git service methods: createTag, listTags, checkoutFile, add
- Added checkpoint/restore/checkpoints actions to git API route
- Added .py export button (L5) to notebook toolbar
- Created ActivityTimeline component (F9) showing recent jobs on dashboard
- Added ActivityTimeline to dashboard page

## Known issues (from spec, still outstanding)
- Markdown rendering in cells uses plain text (no react-markdown) - double-click editing works
- No find/replace (Ctrl+F/Ctrl+H) in notebook
- No variable inspector sidebar
- No F8 checkpoint restore UI (backend done, UI not added to notebook)
- No L6 (unified log viewer page)
- No F10 (inline notification action buttons)
- No E1b create-GitHub-repo wizard integration (standalone GitHub page exists)

## Critical Errata (from spec)
- E1: Kernel messages need ALL header fields (msg_id, session, username, date, msg_type, version, channel) - DONE
- E2: Interrupt/restart are REST POST, not WebSocket - DONE
- E3: Kernel relay reads ?notebook= query param from client URL - DONE
- E4: Watchdog has _manual_stop flag — don't restart if user stopped manually - DONE
- E5: Sanitize all text/html notebook outputs with DOMPurify - DONE
- E6: Agent auto-generates API key — store in project settings as agent.apiKey - DONE
- E7: Settings schema includes agent.port, agent.apiKey, agent.host - DONE
- E8: .ipynb cell.source can be string[] — join on load, save as string - DONE
- E10: Three save modes — manual button, Ctrl+S, autosave (120s, skip if running) - DONE
- E11: Cross-browser: use uuid not crypto.randomUUID(), no structuredClone(), no Array.at() - DONE
