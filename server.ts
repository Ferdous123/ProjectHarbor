import http from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ============================================================
// WebSocket handler registries
// ============================================================

// Lazy-loaded handlers (avoid importing before app.prepare())
let terminalHandler: ((ws: WebSocket, req: IncomingMessage, projectId: string, tab: string) => void) | null = null;
let metricsHandler: ((ws: WebSocket, req: IncomingMessage, projectId: string) => void) | null = null;
let kernelRelayHandler: ((ws: WebSocket, req: IncomingMessage, projectId: string, notebookPath: string) => void) | null = null;

async function loadHandlers() {
  // Dynamic import after app is ready
  try {
    const termMod = await import('./src/server/ws/terminal');
    terminalHandler = termMod.handleTerminalWs;
  } catch {
    console.warn('[server] Terminal WS handler not found, skipping');
  }

  try {
    const metricsMod = await import('./src/server/ws/metrics');
    metricsHandler = metricsMod.handleMetricsWs;
  } catch {
    console.warn('[server] Metrics WS handler not found, skipping');
  }

  try {
    const kernelMod = await import('./src/server/ws/kernel');
    kernelRelayHandler = kernelMod.handleKernelWs;
  } catch {
    console.warn('[server] Kernel relay WS handler not found, skipping');
  }
}

// ============================================================
// Upgrade handler (HTTP → WebSocket)
// ============================================================

function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const { pathname, query } = parse(req.url || '', true);
  if (!pathname) { socket.destroy(); return; }

  // /ws/terminal/:projectId/:tab
  const terminalMatch = pathname.match(/^\/ws\/terminal\/([^/]+)\/([^/]+)$/);
  if (terminalMatch) {
    const [, projectId, tab] = terminalMatch;
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (terminalHandler) {
        terminalHandler(ws, req, projectId, tab);
      } else {
        ws.close(1011, 'Terminal handler not available');
      }
    });
    return;
  }

  // /ws/metrics/:projectId
  const metricsMatch = pathname.match(/^\/ws\/metrics\/([^/]+)$/);
  if (metricsMatch) {
    const [, projectId] = metricsMatch;
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (metricsHandler) {
        metricsHandler(ws, req, projectId);
      } else {
        ws.close(1011, 'Metrics handler not available');
      }
    });
    return;
  }

  // /ws/kernel/:projectId?notebook=path/to/notebook.ipynb (E3)
  const kernelMatch = pathname.match(/^\/ws\/kernel\/([^/]+)$/);
  if (kernelMatch) {
    const [, projectId] = kernelMatch;
    const notebookPath = Array.isArray(query.notebook) ? query.notebook[0] : (query.notebook || '');
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (kernelRelayHandler) {
        kernelRelayHandler(ws, req, projectId, notebookPath);
      } else {
        ws.close(1011, 'Kernel relay handler not available');
      }
    });
    return;
  }

  // Unknown path
  socket.destroy();
}

// ============================================================
// Main startup
// ============================================================

async function main() {
  await app.prepare();
  await loadHandlers();

  // Initialize DB and scheduler after app is ready
  try {
    const { initDb, getSqlite } = await import('./src/server/db/client');
    initDb();
    console.log('[server] Database initialized');

    // Crash recovery: clean stale live-state from previous run
    try {
      const sqlite = getSqlite();
      sqlite.prepare(`UPDATE ssh_sessions SET status = 'disconnected'`).run();
      sqlite.prepare(`UPDATE jobs SET status = 'interrupted', error_message = 'Server restarted — re-run if needed' WHERE status = 'running'`).run();
      sqlite.prepare(`UPDATE jobs SET status = 'queued_stale', error_message = 'Was queued when server restarted' WHERE status = 'queued'`).run();
      sqlite.prepare(`UPDATE terminal_sessions SET status = 'disconnected'`).run();
      sqlite.prepare(`UPDATE ssh_sessions SET jupyter_status = 'unknown'`).run();
      const now = Date.now();
      sqlite.prepare(`UPDATE scheduled_tasks SET next_run_at = ? WHERE enabled = 1 AND next_run_at < ?`).run(new Date(now).toISOString(), new Date(now).toISOString());
      console.log('[server] Crash recovery complete');
    } catch (e) {
      console.warn('[server] Crash recovery skipped:', e);
    }
  } catch {
    console.warn('[server] DB module not found yet, skipping init');
  }

  try {
    const { startScheduler } = await import('./src/server/jobs/scheduler');
    startScheduler();
    console.log('[server] Scheduler started');
  } catch {
    console.warn('[server] Scheduler module not found yet, skipping');
  }

  const httpServer = http.createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    handleUpgrade(wss, req, socket as Duplex, head);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`[server] Ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[server] Shutting down...');

    // Close all WS connections
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close();

    // Checkpoint WAL before exit
    try {
      const { getSqlite } = await import('./src/server/db/client');
      getSqlite().pragma('wal_checkpoint(TRUNCATE)');
    } catch { /* ignore */ }

    // Close SSH pool if loaded
    try {
      const { sshPool } = await import('./src/server/ssh/pool');
      await sshPool.closeAll();
    } catch {
      // SSH pool may not be loaded
    }

    httpServer.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 5s
    setTimeout(() => process.exit(0), 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
