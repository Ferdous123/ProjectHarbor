/**
 * Kernel relay WebSocket handler.
 * Relays messages between browser and Jupyter kernel WebSocket.
 *
 * Critical errata implemented:
 * E1: All Jupyter messages must have full header fields
 * E2: interrupt/restart are REST (not WS) — handled in proxy route
 * E3: notebook path read from ?notebook= query param
 * E4: watchdog manual_stop flag (agent-side, not our concern here)
 * A3: Heartbeat every 15s, auto-reconnect on kernel restart
 */
import type { WebSocket } from 'ws';
import { WebSocket as WsClient } from 'ws';
import type { IncomingMessage } from 'http';
import { projectService } from '@/server/services/project.service';
import type { KernelRelayMessage } from '@/types';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2_000;

interface JupyterSession {
  id: string;
  kernel: { id: string };
  notebook: { path: string };
}

async function getOrCreateSession(
  jupyterBase: string,
  token: string,
  notebookPath: string
): Promise<{ kernelId: string; sessionId: string }> {
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
  };

  // List existing sessions, find by notebook path (E3)
  const sessResp = await fetch(`${jupyterBase}/api/sessions`, { headers });
  if (sessResp.ok) {
    const sessions: JupyterSession[] = await sessResp.json();
    const match = sessions.find(
      (s) => s.notebook?.path === notebookPath || s.notebook?.path === decodeURIComponent(notebookPath)
    );
    if (match) {
      return { kernelId: match.kernel.id, sessionId: match.id };
    }
  }

  // Create new session for this notebook
  const createResp = await fetch(`${jupyterBase}/api/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kernel: { name: 'python3' },
      name: notebookPath,
      path: notebookPath,
      type: 'notebook',
    }),
  });

  if (!createResp.ok) {
    const body = await createResp.text();
    throw new Error(`Failed to create kernel session: ${createResp.status} ${body}`);
  }

  const session: JupyterSession = await createResp.json();
  return { kernelId: session.kernel.id, sessionId: session.id };
}

export async function handleKernelWs(
  clientWs: WebSocket,
  _req: IncomingMessage,
  projectId: string,
  notebookPath: string
): Promise<void> {
  let jupyterWs: WsClient | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let closed = false;

  const sendControl = (msg: KernelRelayMessage) => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify(msg));
    }
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (heartbeatTimeoutTimer) { clearTimeout(heartbeatTimeoutTimer); heartbeatTimeoutTimer = null; }
  };

  let jupyterBase: string;
  let token: string;

  const connectToKernel = async () => {
    if (closed) return;

    try {
      const { kernelId } = await getOrCreateSession(jupyterBase, token, notebookPath);

      const kernelWsUrl = `ws://127.0.0.1:${jupyterBase.split(':')[2]}/api/kernels/${kernelId}/channels?token=${token}`;
      jupyterWs = new WsClient(kernelWsUrl);

      jupyterWs.on('open', () => {
        reconnectAttempts = 0;
        sendControl({ type: 'kernel_connected', kernelId, notebookPath });
        startHeartbeat();
      });

      // Relay Jupyter → client
      jupyterWs.on('message', (data: Buffer | string, isBinary: boolean) => {
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      jupyterWs.on('pong', () => {
        // Heartbeat acknowledged — clear timeout
        if (heartbeatTimeoutTimer) {
          clearTimeout(heartbeatTimeoutTimer);
          heartbeatTimeoutTimer = null;
        }
      });

      jupyterWs.on('close', (code, reason) => {
        clearHeartbeat();
        jupyterWs = null;
        if (closed) return;

        sendControl({
          type: 'kernel_reconnecting',
          code,
          reason: reason?.toString() ?? 'Jupyter kernel disconnected',
        });

        // Auto-reconnect: kernel ID may change on restart
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(connectToKernel, RECONNECT_DELAY_MS * reconnectAttempts);
        } else {
          sendControl({ type: 'kernel_disconnected', code, reason: 'Max reconnect attempts reached' });
        }
      });

      jupyterWs.on('error', (err) => {
        clearHeartbeat();
        sendControl({ type: 'kernel_error', error: err.message });
        jupyterWs = null;
        if (!closed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(connectToKernel, RECONNECT_DELAY_MS * reconnectAttempts);
        }
      });

    } catch (err: any) {
      console.error('[kernel-relay] Connect error:', err.message);
      sendControl({ type: 'kernel_error', error: err.message });
      if (!closed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connectToKernel, RECONNECT_DELAY_MS * reconnectAttempts);
      }
    }
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!jupyterWs || jupyterWs.readyState !== WsClient.OPEN) return;
      jupyterWs.ping();
      // If no pong in 30s, reconnect
      heartbeatTimeoutTimer = setTimeout(() => {
        console.warn('[kernel-relay] Heartbeat timeout — reconnecting');
        jupyterWs?.terminate();
        jupyterWs = null;
        if (!closed) {
          sendControl({ type: 'kernel_reconnecting', code: 1001, reason: 'Heartbeat timeout' });
          reconnectAttempts = 0;
          connectToKernel();
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  };

  try {
    const settings = await projectService.getSettings(projectId);
    const jupyterPort = settings['jupyter.port'] || '8888';
    token = settings['jupyter.token'] || '';
    jupyterBase = `http://127.0.0.1:${jupyterPort}`;

    // Relay client → Jupyter
    clientWs.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (jupyterWs && jupyterWs.readyState === WsClient.OPEN) {
        jupyterWs.send(data, { binary: isBinary });
      }
    });

    // Client disconnects → clean up
    clientWs.on('close', () => {
      closed = true;
      clearHeartbeat();
      jupyterWs?.close(1000, 'Client disconnected');
    });

    clientWs.on('error', () => {
      closed = true;
      clearHeartbeat();
      jupyterWs?.close(1000, 'Client error');
    });

    await connectToKernel();

  } catch (err: any) {
    console.error('[kernel-relay] Fatal error:', err.message);
    sendControl({ type: 'kernel_error', error: err.message });
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close(1011, err.message);
    }
    (jupyterWs as WsClient | null)?.close();
  }
}
