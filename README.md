# ProjectHarbor

Research operations platform. Manages Jupyter notebooks, git, environments,
metrics, and files from any device via Tailscale.

## Quick start
```powershell
npm install
npm run dev
# Open http://localhost:3000
```

## Agent
```powershell
cd pc-agent
pip install flask psutil
python agent.py
```

## Secrets
All secrets live in `.env` (gitignored). Copy `.env.example` to `.env` and fill in values.
