# ProjectHarbor — Configuration Guide (Everything on PC)

## Prerequisites (already done)
- [x] Node.js 20+ installed
- [x] Python 3.11 at F:\Python311
- [x] Git installed + SSH configured
- [x] VSCode + Claude Code extension
- [x] Tailscale installed + signed in

## Step 1: Project folder (already done)
```
F:\Research_Paper_Projects\ProjectHarbor\        ← web app (Claude Code builds this)
F:\Research_Paper_Projects\ProjectHarbor\pc-agent\  ← agent.py + config.json
```

## Step 2: Set up the agent
```powershell
cd F:\Research_Paper_Projects\ProjectHarbor\pc-agent

# Install dependencies
pip install flask psutil
pip install waitress   # optional, recommended

# Copy agent.py and config.json here (from the zip)
# config.json already has your paths:
#   jupyter_env_path: F:\Research_Paper_Projects\Thesis\physicsdp_env
#   jupyter_notebook_dir: F:\Research_Paper_Projects\Thesis

# First run (generates API key):
python agent.py
# Note the API key from the terminal output
# Also saved to: F:\Research_Paper_Projects\ProjectHarbor\pc-agent\API_KEY.txt
# Press Ctrl+C to stop for now (will install as service later)
```

## Step 3: GitHub repo
```powershell
cd F:\Research_Paper_Projects\ProjectHarbor

# Create repo on GitHub (pick one method):

# Method A: GitHub CLI (if installed)
gh repo create projectharbor --private

# Method B: GitHub website
# Go to github.com → New Repository → "projectharbor" → Private → Create
# Then:
git init
git remote add origin git@github.com:YOUR_USERNAME/projectharbor.git
```

Claude Code uses your existing git + SSH config automatically. It will commit and push when you tell it to. No extra setup.

## Step 4: Build with Claude Code

Open `F:\Research_Paper_Projects\ProjectHarbor` in VSCode.

Open Claude Code extension. First message:

> Read all the .md files in this directory. Start Phase 1 from claude-code-prompt.md.

After Phase 1 finishes:

> Commit and push: git add -A && git commit -m "Phase 1: scaffold" && git push -u origin main

Continue phase by phase.

## Step 5: Install agent as auto-start service (after build is done)

```powershell
# Option A: Task Scheduler
schtasks /create /tn "ProjectHarborAgent" ^
  /tr "F:\Python311\pythonw.exe F:\Research_Paper_Projects\ProjectHarbor\pc-agent\agent.py" ^
  /sc onstart /rl highest /f

# Option B: NSSM (more reliable)
# Download nssm from https://nssm.cc/download
nssm install ProjectHarborAgent "F:\Python311\python.exe" "F:\Research_Paper_Projects\ProjectHarbor\pc-agent\agent.py"
nssm set ProjectHarborAgent AppDirectory "F:\Research_Paper_Projects\ProjectHarbor\pc-agent"
nssm set ProjectHarborAgent Start SERVICE_AUTO_START
nssm start ProjectHarborAgent
```

## Step 6: Install web app as auto-start service (after build is done)

```powershell
# Build first
cd F:\Research_Paper_Projects\ProjectHarbor
npm run build

# Install with NSSM
nssm install ProjectHarbor "C:\Program Files\nodejs\node.exe" "F:\Research_Paper_Projects\ProjectHarbor\server.js"
nssm set ProjectHarbor AppDirectory "F:\Research_Paper_Projects\ProjectHarbor"
nssm set ProjectHarbor Start SERVICE_AUTO_START
nssm start ProjectHarbor
```

## Step 7: Tailscale access
```powershell
# Find your PC's Tailscale IP:
tailscale ip

# From any device on your Tailscale network:
# http://100.x.x.x:3000
```

## Step 8: iPhone setup
1. Install Tailscale from App Store
2. Sign in with same account
3. Open Safari → http://100.x.x.x:3000
4. Add to Home Screen for app-like experience

## Prevent PC from sleeping
```powershell
# Disable sleep when plugged in
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

## Your paths reference
```
Python:       F:\Python311\python.exe
Venv:         F:\Research_Paper_Projects\Thesis\physicsdp_env
Notebooks:    F:\Research_Paper_Projects\Thesis
ProjectHarbor:   F:\Research_Paper_Projects\ProjectHarbor
Agent:        F:\Research_Paper_Projects\ProjectHarbor\pc-agent
```

## Troubleshooting

### Agent returns 401
```powershell
type F:\Research_Paper_Projects\ProjectHarbor\pc-agent\API_KEY.txt
# Copy this key into ProjectHarbor project settings
```

### Jupyter won't start via agent
```powershell
# Check manually:
F:\Research_Paper_Projects\Thesis\physicsdp_env\Scripts\python.exe -m jupyter notebook --port=8888 --no-browser
# Check agent log:
type F:\Research_Paper_Projects\ProjectHarbor\pc-agent\jupyter.log
```

### Can't access from phone
```powershell
# Check Tailscale is running on PC:
tailscale status
# Check firewall:
netsh advfirewall firewall add rule name="ProjectHarbor" dir=in action=allow protocol=tcp localport=3000
netsh advfirewall firewall add rule name="ProjectHarborAgent" dir=in action=allow protocol=tcp localport=9111
```

### Jupyter keeps restarting after manual stop
```powershell
# Pause watchdog:
curl -X POST -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"action\":\"disable\"}" http://localhost:9111/jupyter/watchdog
```
