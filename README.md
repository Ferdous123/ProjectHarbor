# ProjectHarbor

A self-hosted research operations platform that runs entirely on your PC.
Manage Jupyter notebooks, terminals, files, git repos, environments, metrics,
and backups from any device — phone, laptop, tablet — via Tailscale.

## What it does

- **Notebook UI** — Colab-like interface connected to your local Jupyter kernel.
  Run cells, see outputs (text, images, DataFrames, errors), save, export. Full markdown rendering with LaTeX math (KaTeX).
- **Terminal** — Full PowerShell terminal in the browser. Run any command remotely.
- **File Browser** — Browse, edit, search, preview CSV/images, upload/download.
- **Git Management** — Pull, push, commit, branch, diff, merge, checkpoints — all from the UI.
- **GitHub Integration** — Create repos, browse remote files, link repos to projects.
- **Metrics Dashboard** — CPU, RAM, GPU, disk usage. Live charts, historical data.
- **Process Manager** — View and kill processes on your PC remotely.
- **3-Layer Backup** — Local disk + Git auto-push + backup drive. Version tracking, one-click restore, SSE progress streaming.
- **Crash Recovery** — PC reboots? Everything auto-starts. No data lost. No manual intervention.
- **Variable Inspector** — See all kernel variables in a live sidebar panel (Ctrl+Shift+H).
- **Find/Replace** — Search across all notebook cells (Ctrl+F) with multi-cell replace.
- **Log Viewer** — Agent, Jupyter, and system audit logs in one place.
- **Mobile Ready** — Responsive UI. Check GPU usage from your phone. Start Jupyter from bed.

## Architecture

Everything runs on ONE Windows PC. No cloud. No external servers.

```
Windows PC (always on)
├── ProjectHarbor Web App (Next.js, port 3000)
├── ProjectHarbor Agent (Python Flask, port 9111)
├── Jupyter Server (port 8888, managed by agent)
└── Your project files, git repos, Python envs

Any device → Tailscale VPN → http://100.x.x.x:3000
```

## Requirements

- Windows 10/11 PC (always on, plugged in)
- Node.js 20+
- Python 3.10+
- Git
- Tailscale (free)

## Quick Start

```bash
# Clone
git clone git@github.com:Ferdous123/ProjectHarbor.git
cd ProjectHarbor

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your GitHub token

# Start agent
cd pc-agent
pip install flask psutil requests
python agent.py
# Note the API key printed on first run — add to .env as AGENT_API_KEY

# Start web app (separate terminal)
cd ..
npm run dev
# Open http://localhost:3000
```

## Configuration

All secrets live in `.env` (gitignored):

```
GITHUB_TOKEN=ghp_...          # GitHub API access
GITHUB_USERNAME=your_username
AGENT_PORT=9111
AGENT_API_KEY=                 # Auto-generated on first agent run
PORT=3000
```

Per-project settings (Jupyter token, paths, git remote, etc.) are configured
through the project wizard in the UI and stored in the local database.

## Install as Windows Services (auto-start on boot)

```powershell
# Using NSSM (https://nssm.cc)
nssm install ProjectHarborAgent python.exe "F:\path\to\pc-agent\agent.py"
nssm install ProjectHarborWeb node.exe "F:\path\to\server.js"
```

## Access from iPhone

1. Install Tailscale on your iPhone
2. Sign in with the same account as your PC
3. Open Safari → http://100.x.x.x:3000
4. Add to Home Screen for app-like experience

## Backup System

Three automatic layers, all non-blocking:

| Layer | What | When |
|-------|------|------|
| **Layer 1** | `.ipynb` file + `.harbor-backup` on local disk | Every save (instant) |
| **Layer 2** | Git auto-push to GitHub | Every 30 min (configurable) |
| **Layer 3** | Copy to local backup dir | Every 6 hours (optional) |

All backups run in background. Progress shown in dashboard. No UI blocking.

## Security

- All traffic encrypted via Tailscale (WireGuard). Not exposed to public internet.
- Only devices signed into YOUR Tailscale account can access.
- Agent API requires an API key.
- No telemetry. No external calls except GitHub API (when you use git features).

## License

Private. Not for redistribution.
