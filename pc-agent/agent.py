#!/usr/bin/env python3
"""
ProjectHarbor PC Agent v2.0
Lightweight always-on service for Windows PC.
Manages Jupyter lifecycle, collects metrics, serves REST API.

Secrets: reads from ../.env (project root)
Settings: reads from ./config.json (this folder)

Install: pip install flask psutil
Run: pythonw agent.py (background) or python agent.py (foreground)
"""

import os, sys, json, time, sqlite3, signal, logging, subprocess, threading, socket
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager

try:
    from flask import Flask, jsonify, request, Response
    import psutil
except ImportError:
    print("Missing dependencies. Run: pip install flask psutil")
    sys.exit(1)

# === PATHS ===
AGENT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = AGENT_DIR.parent  # F:\Research_Paper_Projects\ProjectHarbor
ENV_PATH = PROJECT_ROOT / ".env"
DB_PATH = AGENT_DIR / "agent.db"
CONFIG_PATH = AGENT_DIR / "config.json"
LOG_PATH = AGENT_DIR / "agent.log"
PID_PATH = AGENT_DIR / "agent.pid"

# === LOGGING ===
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("agent")

# === .ENV LOADER ===
def load_env(path):
    """Read key=value pairs from .env file. No dependency needed."""
    env = {}
    if not path.exists():
        return env
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            # Remove surrounding quotes if present
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            env[key] = value
    return env

def write_env_key(path, key, value):
    """Update or append a key in the .env file."""
    lines = []
    found = False
    if path.exists():
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped.startswith(f"{key} ="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)

# === CONFIG ===
def load_config():
    """Load non-sensitive settings from config.json, secrets from .env"""
    # Defaults (non-sensitive only)
    cfg = {
        "bind_host": "0.0.0.0",
        "jupyter_watchdog": True,
        "jupyter_watchdog_interval_sec": 15,
        "metrics_interval_sec": 30,
        "metrics_retention_hours": 48,
        "process_snapshot_interval_sec": 60,
        "auto_commit_enabled": False,
        "auto_commit_interval_min": 60,
        "auto_commit_repo_path": "",
        "auto_commit_message_prefix": "auto: ",
        "allowed_origins": ["*"],
    }

    # Load config.json overrides
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            user = json.load(f)
        # Skip _comment keys
        cfg.update({k: v for k, v in user.items() if not k.startswith("_")})

    # Load secrets + paths from .env
    env = load_env(ENV_PATH)
    cfg["jupyter_token"] = env.get("JUPYTER_TOKEN", "changeme")
    cfg["jupyter_port"] = int(env.get("JUPYTER_PORT", "8888"))
    cfg["agent_port"] = int(env.get("AGENT_PORT", "9111"))
    cfg["api_key"] = env.get("AGENT_API_KEY", "")
    cfg["jupyter_env_path"] = env.get("JUPYTER_ENV_PATH", "")
    cfg["jupyter_notebook_dir"] = env.get("JUPYTER_NOTEBOOK_DIR", "")
    cfg["auto_commit_repo_path"] = env.get("AUTO_COMMIT_REPO", cfg.get("auto_commit_repo_path", ""))

    return cfg

def save_config(cfg):
    """Save only non-sensitive settings to config.json."""
    safe_keys = ["jupyter_watchdog", "jupyter_watchdog_interval_sec", "metrics_interval_sec",
                 "metrics_retention_hours", "process_snapshot_interval_sec", "auto_commit_enabled",
                 "auto_commit_interval_min", "auto_commit_message_prefix", "allowed_origins", "bind_host"]
    safe = {k: cfg[k] for k in safe_keys if k in cfg}
    with open(CONFIG_PATH, "w") as f:
        json.dump(safe, f, indent=2)

config = load_config()

# === DATABASE ===
def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        cpu_pct REAL, ram_pct REAL, ram_used_gb REAL, ram_total_gb REAL,
        gpu_pct REAL, gpu_vram_pct REAL, gpu_vram_gb REAL, gpu_temp REAL,
        disk_json TEXT,
        net_sent_kbps REAL, net_recv_kbps REAL
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts DESC);

    CREATE TABLE IF NOT EXISTS jupyter_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        event TEXT NOT NULL,
        details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jev_ts ON jupyter_events(ts DESC);

    CREATE TABLE IF NOT EXISTS process_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        processes_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proc_ts ON process_log(ts DESC);

    CREATE TABLE IF NOT EXISTS agent_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alog_ts ON agent_log(ts DESC);
    """)
    db.commit()
    db.close()

# === GPU HELPERS ===
def get_nvidia_gpu():
    """Get NVIDIA GPU stats via nvidia-smi."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
             "--format=csv,noheader,nounits"],
            timeout=5, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        ).decode().strip()
        parts = [x.strip() for x in out.split(",")]
        if len(parts) >= 4:
            return {
                "gpu_pct": float(parts[0]),
                "gpu_vram_gb": float(parts[1]) / 1024,
                "gpu_vram_total_gb": float(parts[2]) / 1024,
                "gpu_vram_pct": round(float(parts[1]) / float(parts[2]) * 100, 1) if float(parts[2]) > 0 else 0,
                "gpu_temp": float(parts[3])
            }
    except Exception:
        pass
    return {"gpu_pct": None, "gpu_vram_gb": None, "gpu_vram_pct": None, "gpu_temp": None}

# === METRICS COLLECTOR ===
_prev_net = None

def collect_metrics():
    global _prev_net
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disks = []
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({
                "drive": part.device,
                "mountpoint": part.mountpoint,
                "used_gb": round(usage.used / (1024**3), 2),
                "total_gb": round(usage.total / (1024**3), 2),
                "percent": usage.percent
            })
        except (PermissionError, OSError):
            pass

    net = psutil.net_io_counters()
    net_sent, net_recv = 0.0, 0.0
    if _prev_net:
        elapsed = config["metrics_interval_sec"]
        net_sent = (net.bytes_sent - _prev_net.bytes_sent) / elapsed / 1024
        net_recv = (net.bytes_recv - _prev_net.bytes_recv) / elapsed / 1024
    _prev_net = net

    gpu = get_nvidia_gpu()

    row = {
        "ts": int(time.time()),
        "cpu_pct": cpu,
        "ram_pct": mem.percent,
        "ram_used_gb": round(mem.used / (1024**3), 2),
        "ram_total_gb": round(mem.total / (1024**3), 2),
        "gpu_pct": gpu["gpu_pct"],
        "gpu_vram_pct": gpu["gpu_vram_pct"],
        "gpu_vram_gb": gpu["gpu_vram_gb"],
        "gpu_temp": gpu["gpu_temp"],
        "disk_json": json.dumps(disks),
        "net_sent_kbps": round(net_sent, 1),
        "net_recv_kbps": round(net_recv, 1)
    }
    db = get_db()
    db.execute(
        "INSERT INTO metrics (ts,cpu_pct,ram_pct,ram_used_gb,ram_total_gb,gpu_pct,gpu_vram_pct,gpu_vram_gb,gpu_temp,disk_json,net_sent_kbps,net_recv_kbps) VALUES (:ts,:cpu_pct,:ram_pct,:ram_used_gb,:ram_total_gb,:gpu_pct,:gpu_vram_pct,:gpu_vram_gb,:gpu_temp,:disk_json,:net_sent_kbps,:net_recv_kbps)",
        row
    )
    db.commit()
    db.close()
    return row

def collect_processes():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status']):
        try:
            info = p.info
            procs.append({
                "pid": info['pid'],
                "name": info['name'],
                "cpu": info.get('cpu_percent', 0),
                "ram_mb": round(info['memory_info'].rss / (1024**2), 1) if info.get('memory_info') else 0,
                "status": info.get('status', 'unknown')
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x.get('cpu', 0), reverse=True)
    top = procs[:30]
    db = get_db()
    db.execute("INSERT INTO process_log (ts, processes_json) VALUES (?, ?)",
               (int(time.time()), json.dumps(top)))
    db.commit()
    db.close()
    return top

# === JUPYTER MANAGEMENT ===
_jupyter_proc = None
_jupyter_start_time = None
_manual_stop = False          # BUG FIX: prevents watchdog from restarting after manual stop
_watchdog_backoff_until = 0   # BUG FIX: exponential backoff on repeated failures
_watchdog_fail_count = 0
JUPYTER_LOG_PATH = AGENT_DIR / "jupyter.log"

def is_jupyter_running():
    """Check if Jupyter is running. Uses psutil.net_connections with fallback to socket probe."""
    port = config["jupyter_port"]
    # Method 1: psutil (needs admin on some Windows configs)
    try:
        for conn in psutil.net_connections(kind='tcp'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                return True
        return False
    except (psutil.AccessDenied, OSError):
        pass
    # Method 2: socket probe fallback (always works, no admin needed)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        result = s.connect_ex(('127.0.0.1', port))
        s.close()
        return result == 0
    except Exception:
        return False

def get_jupyter_pid():
    """Get PID of Jupyter process. Returns None if not found or no permission."""
    port = config["jupyter_port"]
    try:
        for conn in psutil.net_connections(kind='tcp'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                return conn.pid
    except (psutil.AccessDenied, OSError):
        # Fallback: find by process name
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = p.info.get('cmdline') or []
                if any('jupyter' in str(c).lower() for c in cmdline):
                    return p.info['pid']
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    return None

def start_jupyter():
    global _jupyter_proc, _jupyter_start_time, _manual_stop, _watchdog_fail_count
    _manual_stop = False  # Clear manual stop flag on any start
    _watchdog_fail_count = 0

    env_path = config["jupyter_env_path"]
    nb_dir = config["jupyter_notebook_dir"]
    port = config["jupyter_port"]
    token = config["jupyter_token"]

    if not env_path or not nb_dir:
        log.error("jupyter_env_path or jupyter_notebook_dir not configured")
        return False, "Not configured"

    python_exe = os.path.join(env_path, "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = os.path.join(env_path, "bin", "python")
    if not os.path.exists(python_exe):
        log.error(f"Python not found at {python_exe}")
        return False, f"Python not found at {python_exe}"

    # Kill any stale process on port
    kill_port(port)
    time.sleep(1)

    cmd = [
        python_exe, "-m", "jupyter", "notebook",
        "--ip=0.0.0.0",
        f"--port={port}",
        "--no-browser",
        "--ServerApp.allow_origin=*",
        "--ServerApp.allow_credentials=True",
        "--ServerApp.port_retries=0",
        f"--IdentityProvider.token={token}",
        f"--notebook-dir={nb_dir}"
    ]

    log.info(f"Starting Jupyter on port {port}")
    try:
        # Capture Jupyter logs for debugging (rotate: truncate if > 10MB)
        if JUPYTER_LOG_PATH.exists() and JUPYTER_LOG_PATH.stat().st_size > 10 * 1024 * 1024:
            JUPYTER_LOG_PATH.write_text("")
        jupyter_log_file = open(JUPYTER_LOG_PATH, "a", encoding="utf-8")

        _jupyter_proc = subprocess.Popen(
            cmd,
            stdout=jupyter_log_file,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        _jupyter_start_time = time.time()

        # Wait for it to come up (max 30s)
        for _ in range(30):
            time.sleep(1)
            if is_jupyter_running():
                record_jupyter_event("start", f"PID={_jupyter_proc.pid}, port={port}")
                log.info(f"Jupyter started on port {port} (PID {_jupyter_proc.pid})")
                return True, "Started"

        record_jupyter_event("start_failed", "Timed out waiting for port")
        return False, "Timeout"
    except Exception as e:
        log.error(f"Failed to start Jupyter: {e}")
        record_jupyter_event("start_failed", str(e))
        return False, str(e)

def stop_jupyter():
    global _jupyter_proc, _jupyter_start_time, _manual_stop
    _manual_stop = True  # BUG FIX: tell watchdog not to restart

    pid = get_jupyter_pid()
    if pid:
        try:
            proc = psutil.Process(pid)
            children = proc.children(recursive=True)
            for child in children:
                child.terminate()
            proc.terminate()
            proc.wait(timeout=10)
        except (psutil.NoSuchProcess, psutil.TimeoutExpired):
            kill_port(config["jupyter_port"])
        except psutil.AccessDenied:
            # Fallback: taskkill on Windows
            try:
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], timeout=5,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            except Exception:
                pass

    _jupyter_proc = None
    _jupyter_start_time = None
    record_jupyter_event("stop", f"PID={pid}, manual=True")
    log.info("Jupyter stopped (manual)")
    return True

def kill_port(port):
    try:
        for conn in psutil.net_connections(kind='tcp'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                try:
                    psutil.Process(conn.pid).kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
    except (psutil.AccessDenied, OSError):
        # Fallback on Windows without admin
        try:
            subprocess.run(
                ["powershell", "-Command",
                 f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | "
                 f"ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"],
                timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            )
        except Exception:
            pass

def record_jupyter_event(event, details=None):
    db = get_db()
    db.execute("INSERT INTO jupyter_events (ts, event, details) VALUES (?, ?, ?)",
               (int(time.time()), event, details))
    db.commit()
    db.close()

# === BACKGROUND THREADS ===
class MetricsThread(threading.Thread):
    daemon = True
    def run(self):
        while True:
            try:
                collect_metrics()
            except Exception as e:
                log.error(f"Metrics collection error: {e}")
            time.sleep(config["metrics_interval_sec"])

class ProcessThread(threading.Thread):
    daemon = True
    def run(self):
        while True:
            try:
                collect_processes()
            except Exception as e:
                log.error(f"Process collection error: {e}")
            time.sleep(config["process_snapshot_interval_sec"])

class JupyterWatchdog(threading.Thread):
    daemon = True
    def run(self):
        global _watchdog_fail_count, _watchdog_backoff_until
        was_running = is_jupyter_running()
        while True:
            try:
                if config["jupyter_watchdog"]:
                    running = is_jupyter_running()
                    if was_running and not running:
                        # BUG FIX: Don't restart if manually stopped
                        if _manual_stop:
                            log.info("Watchdog: Jupyter stopped manually, NOT restarting")
                            was_running = False
                            continue

                        # BUG FIX: Exponential backoff on repeated failures
                        now = time.time()
                        if now < _watchdog_backoff_until:
                            was_running = False
                            time.sleep(config["jupyter_watchdog_interval_sec"])
                            continue

                        log.warning("Watchdog: Jupyter process died, restarting...")
                        record_jupyter_event("crash", "Detected by watchdog")
                        time.sleep(3)
                        ok, msg = start_jupyter()
                        if ok:
                            record_jupyter_event("watchdog_restart", "Success")
                            _watchdog_fail_count = 0
                        else:
                            _watchdog_fail_count += 1
                            # Backoff: 30s, 60s, 120s, 240s, max 300s
                            backoff = min(30 * (2 ** _watchdog_fail_count), 300)
                            _watchdog_backoff_until = time.time() + backoff
                            record_jupyter_event("watchdog_restart_failed",
                                                 f"{msg}, backoff={backoff}s, attempt={_watchdog_fail_count}")
                            log.error(f"Watchdog restart failed (attempt {_watchdog_fail_count}), "
                                      f"backing off {backoff}s")
                    was_running = running
            except Exception as e:
                log.error(f"Watchdog error: {e}")
            time.sleep(config["jupyter_watchdog_interval_sec"])

class CleanupThread(threading.Thread):
    daemon = True
    def run(self):
        while True:
            try:
                cutoff = int(time.time()) - (config["metrics_retention_hours"] * 3600)
                db = get_db()
                db.execute("DELETE FROM metrics WHERE ts < ?", (cutoff,))
                deleted_metrics = db.execute("SELECT changes()").fetchone()[0]
                db.execute("DELETE FROM process_log WHERE ts < ?", (cutoff,))
                deleted_procs = db.execute("SELECT changes()").fetchone()[0]
                # Also clean old jupyter events (keep 7 days)
                event_cutoff = int(time.time()) - (7 * 24 * 3600)
                db.execute("DELETE FROM jupyter_events WHERE ts < ?", (event_cutoff,))
                deleted_events = db.execute("SELECT changes()").fetchone()[0]
                db.commit()
                db.close()
                total = deleted_metrics + deleted_procs + deleted_events
                if total > 0:
                    log.info(f"Cleanup: removed {deleted_metrics} metrics, {deleted_procs} proc snapshots, {deleted_events} events")
            except Exception as e:
                log.error(f"Cleanup error: {e}")
            time.sleep(3600)  # every hour

class AutoCommitThread(threading.Thread):
    daemon = True
    def run(self):
        while True:
            try:
                if config["auto_commit_enabled"] and config["auto_commit_repo_path"]:
                    repo = config["auto_commit_repo_path"]
                    result = subprocess.run(
                        ["git", "status", "--porcelain"],
                        cwd=repo, capture_output=True, text=True, timeout=30,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
                    )
                    if result.stdout.strip():
                        msg = f"{config['auto_commit_message_prefix']}{datetime.now().strftime('%Y-%m-%d %H:%M')}"
                        subprocess.run(["git", "add", "-A"], cwd=repo, timeout=30,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                        subprocess.run(["git", "commit", "-m", msg], cwd=repo, timeout=30,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                        log.info(f"Auto-committed to {repo}")
            except Exception as e:
                log.error(f"Auto-commit error: {e}")
            time.sleep(config["auto_commit_interval_min"] * 60)

# === FLASK API ===
app = Flask(__name__)
START_TIME = time.time()

def check_auth():
    """Simple API key auth if configured."""
    key = config.get("api_key", "")
    if key:
        provided = request.headers.get("X-API-Key", "") or request.args.get("key", "")
        if provided != key:
            return jsonify({"error": "Unauthorized"}), 401
    return None

@app.before_request
def auth_middleware():
    # BUG FIX: Handle CORS preflight
    if request.method == 'OPTIONS':
        return Response(status=200)
    if request.endpoint and request.endpoint != 'health':
        result = check_auth()
        if result:
            return result

@app.after_request
def cors(response):
    origins = config.get("allowed_origins", ["*"])
    origin = request.headers.get("Origin", "*")
    if "*" in origins or origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-API-Key, Authorization"
    return response

@app.route("/health")
def health():
    jupyter_pid = get_jupyter_pid()
    return jsonify({
        "status": "ok",
        "uptime_sec": round(time.time() - START_TIME),
        "jupyter_running": is_jupyter_running(),
        "jupyter_pid": jupyter_pid,
        "jupyter_uptime_sec": round(time.time() - _jupyter_start_time) if _jupyter_start_time and is_jupyter_running() else None,
        "hostname": socket.gethostname(),
        "agent_version": "2.0.0-harbor",
        "timestamp": int(time.time())
    })

@app.route("/metrics")
def metrics_endpoint():
    hours = request.args.get("hours", 6, type=float)
    cutoff = int(time.time()) - int(hours * 3600)
    limit = request.args.get("limit", 2000, type=int)
    db = get_db()
    rows = db.execute(
        "SELECT * FROM metrics WHERE ts > ? ORDER BY ts ASC LIMIT ?",
        (cutoff, limit)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route("/metrics/latest")
def metrics_latest():
    db = get_db()
    row = db.execute("SELECT * FROM metrics ORDER BY ts DESC LIMIT 1").fetchone()
    db.close()
    if row:
        result = dict(row)
        result["disk"] = json.loads(result.get("disk_json", "[]"))
        return jsonify(result)
    return jsonify({"error": "No metrics"}), 404

@app.route("/jupyter/status")
def jupyter_status():
    running = is_jupyter_running()
    pid = get_jupyter_pid()
    return jsonify({
        "running": running,
        "pid": pid,
        "port": config["jupyter_port"],
        "uptime_sec": round(time.time() - _jupyter_start_time) if _jupyter_start_time and running else None,
        # BUG FIX: Don't expose token in GET response. Client knows the token from its own config.
        "watchdog_enabled": config["jupyter_watchdog"],
        "manual_stop": _manual_stop,  # UI can show "stopped manually, watchdog paused"
    })

@app.route("/jupyter/start", methods=["POST"])
def jupyter_start_endpoint():
    if is_jupyter_running():
        return jsonify({"status": "already_running", "pid": get_jupyter_pid()})
    ok, msg = start_jupyter()
    if ok:
        return jsonify({"status": "started", "pid": get_jupyter_pid()})
    return jsonify({"status": "failed", "error": msg}), 500

@app.route("/jupyter/stop", methods=["POST"])
def jupyter_stop_endpoint():
    if not is_jupyter_running():
        return jsonify({"status": "already_stopped"})
    stop_jupyter()
    return jsonify({"status": "stopped"})

@app.route("/jupyter/restart", methods=["POST"])
def jupyter_restart_endpoint():
    stop_jupyter()
    time.sleep(2)
    ok, msg = start_jupyter()  # start_jupyter clears _manual_stop
    if ok:
        return jsonify({"status": "restarted", "pid": get_jupyter_pid()})
    return jsonify({"status": "failed", "error": msg}), 500

@app.route("/jupyter/watchdog", methods=["POST"])
def jupyter_watchdog_control():
    """Enable/disable watchdog, or resume after manual stop."""
    data = request.get_json(force=True, silent=True) or {}
    global _manual_stop
    action = data.get("action")
    if action == "resume":
        _manual_stop = False
        log.info("Watchdog resumed (manual stop cleared)")
        return jsonify({"status": "resumed", "manual_stop": False})
    elif action == "enable":
        config["jupyter_watchdog"] = True
        save_config(config)
        return jsonify({"status": "enabled"})
    elif action == "disable":
        config["jupyter_watchdog"] = False
        save_config(config)
        return jsonify({"status": "disabled"})
    return jsonify({"error": "action must be resume|enable|disable"}), 400

@app.route("/jupyter/logs")
def jupyter_logs_endpoint():
    """Return last N lines of Jupyter server log."""
    lines = request.args.get("lines", 100, type=int)
    try:
        if JUPYTER_LOG_PATH.exists():
            with open(JUPYTER_LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
            return jsonify({"lines": all_lines[-lines:]})
        return jsonify({"lines": [], "note": "No jupyter log file yet"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/jupyter/events")
def jupyter_events_endpoint():
    limit = request.args.get("limit", 50, type=int)
    db = get_db()
    rows = db.execute("SELECT * FROM jupyter_events ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route("/processes")
def processes_endpoint():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status']):
        try:
            info = p.info
            procs.append({
                "pid": info['pid'],
                "name": info['name'],
                "cpu": info.get('cpu_percent', 0),
                "ram_mb": round(info['memory_info'].rss / (1024**2), 1) if info.get('memory_info') else 0,
                "status": info.get('status', 'unknown')
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs.sort(key=lambda x: x.get('cpu', 0), reverse=True)
    return jsonify(procs[:50])

@app.route("/processes/kill", methods=["POST"])
def kill_process():
    data = request.get_json(force=True, silent=True) or {}
    pid = data.get("pid")
    if not pid:
        return jsonify({"error": "pid required"}), 400
    try:
        proc = psutil.Process(int(pid))
        name = proc.name()
        proc.terminate()
        proc.wait(timeout=5)
        return jsonify({"status": "killed", "pid": pid, "name": name})
    except psutil.NoSuchProcess:
        return jsonify({"error": "Process not found"}), 404
    except psutil.AccessDenied:
        return jsonify({"error": "Access denied"}), 403
    except psutil.TimeoutExpired:
        psutil.Process(int(pid)).kill()
        return jsonify({"status": "force_killed", "pid": pid})

@app.route("/system")
def system_info():
    cpu_freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    return jsonify({
        "hostname": socket.gethostname(),
        "platform": sys.platform,
        "cpu_count_logical": psutil.cpu_count(),
        "cpu_count_physical": psutil.cpu_count(logical=False),
        "cpu_freq_mhz": cpu_freq.current if cpu_freq else None,
        "ram_total_gb": round(mem.total / (1024**3), 2),
        "gpu": get_nvidia_gpu(),
        "boot_time": int(psutil.boot_time()),
        "uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 1),
        "python_version": sys.version.split()[0]
    })

@app.route("/git/status")
def git_status():
    path = request.args.get("path", config.get("auto_commit_repo_path", ""))
    if not path:
        return jsonify({"error": "path required"}), 400
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "-b"],
            cwd=path, capture_output=True, text=True, timeout=15,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        return jsonify({"output": result.stdout, "error": result.stderr, "code": result.returncode})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/git/pull", methods=["POST"])
def git_pull():
    data = request.get_json(force=True, silent=True) or {}
    path = data.get("path", config.get("auto_commit_repo_path", ""))
    if not path:
        return jsonify({"error": "path required"}), 400
    try:
        result = subprocess.run(
            ["git", "pull"],
            cwd=path, capture_output=True, text=True, timeout=60,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        return jsonify({"output": result.stdout, "error": result.stderr, "code": result.returncode})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/git/commit", methods=["POST"])
def git_commit():
    data = request.get_json(force=True, silent=True) or {}
    path = data.get("path", config.get("auto_commit_repo_path", ""))
    message = data.get("message", f"commit {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if not path:
        return jsonify({"error": "path required"}), 400
    try:
        subprocess.run(["git", "add", "-A"], cwd=path, timeout=30,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        result = subprocess.run(
            ["git", "commit", "-m", message],
            cwd=path, capture_output=True, text=True, timeout=30,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        )
        return jsonify({"output": result.stdout, "error": result.stderr, "code": result.returncode})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/config", methods=["GET"])
def config_get():
    safe = {k: v for k, v in config.items() if k not in ("api_key",)}
    safe["jupyter_token"] = "***" if config.get("jupyter_token") else ""
    return jsonify(safe)

@app.route("/config", methods=["PUT"])
def config_update():
    global config
    data = request.get_json(force=True, silent=True) or {}
    for k, v in data.items():
        if k in DEFAULT_CONFIG:
            config[k] = v
    save_config(config)
    return jsonify({"status": "updated"})

@app.route("/logs")
def logs_endpoint():
    lines = request.args.get("lines", 100, type=int)
    try:
        with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        return jsonify({"lines": all_lines[-lines:]})
    except FileNotFoundError:
        return jsonify({"lines": []})

# === MAIN ===
def write_pid():
    with open(PID_PATH, "w") as f:
        f.write(str(os.getpid()))

def main():
    global config
    log.info("=" * 60)
    log.info(f"ProjectHarbor Agent v2.0 starting (PID {os.getpid()})")
    log.info(f"Agent dir: {AGENT_DIR}")
    log.info(f"Env file: {ENV_PATH}")
    log.info(f"Config: port={config['agent_port']}, jupyter_port={config['jupyter_port']}")
    log.info(f"Jupyter watchdog: {'ON' if config['jupyter_watchdog'] else 'OFF'}")

    # BUG FIX: Auto-generate API key on first run
    if not config.get("api_key"):
        import secrets
        config["api_key"] = secrets.token_urlsafe(32)
        # Write to .env file (the single source of truth for secrets)
        write_env_key(ENV_PATH, "AGENT_API_KEY", config["api_key"])
        log.info(f"Generated API key and saved to {ENV_PATH}")
        log.info(f"API Key: {config['api_key']}")
        log.info(f"This key is in your .env file under AGENT_API_KEY")

    log.info("=" * 60)

    init_db()
    write_pid()

    # Start background threads
    MetricsThread().start()
    ProcessThread().start()
    JupyterWatchdog().start()
    CleanupThread().start()
    if config["auto_commit_enabled"]:
        AutoCommitThread().start()
        log.info(f"Auto-commit enabled for: {config['auto_commit_repo_path']}")

    # Initial metrics collection
    try:
        collect_metrics()
    except Exception as e:
        log.warning(f"Initial metrics failed: {e}")

    # Start Jupyter if watchdog is on and it's not running
    if config["jupyter_watchdog"] and not is_jupyter_running():
        if config["jupyter_env_path"] and config["jupyter_notebook_dir"]:
            log.info("Starting Jupyter on agent startup...")
            start_jupyter()

    # BUG FIX: Use waitress for production-grade serving if available
    host = config["bind_host"]
    port = config["agent_port"]
    try:
        from waitress import serve
        log.info(f"Starting server with waitress on {host}:{port}")
        serve(app, host=host, port=port, threads=4)
    except ImportError:
        log.warning("waitress not installed. Using Flask dev server. "
                     "For production: pip install waitress")
        app.run(
            host=host,
            port=port,
            debug=False,
            threaded=True,
            use_reloader=False
        )

if __name__ == "__main__":
    main()
