/**
 * Metrics WebSocket handler.
 * On connect: bulk-fetch history from agent (48h).
 * Then poll agent /metrics/latest every 10s.
 */
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { projectService } from '@/server/services/project.service';
import { metricsService } from '@/server/services/metrics.service';

export async function handleMetricsWs(
  ws: WebSocket,
  _req: IncomingMessage,
  projectId: string
): Promise<void> {
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let settings: Record<string, string> = {};

  const send = (data: unknown) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  try {
    settings = await projectService.getSettings(projectId);

    // 1. Bulk-fetch historical metrics from DB (what we have stored)
    const history = await metricsService.getHistory(projectId, 48);
    if (history.length > 0) {
      send({ type: 'history', data: history });
    }

    // 2. Also fetch from agent if available
    const agentHistory = await metricsService.fetchFromAgent(projectId, 1);
    if (agentHistory.length > 0) {
      // Store in DB and send
      await metricsService.storeMany(projectId, agentHistory);
      send({ type: 'history', data: agentHistory });
    }

    // 3. Poll every 10s
    pollInterval = setInterval(async () => {
      try {
        const latest = await metricsService.fetchLatestFromAgent(projectId);
        if (latest) {
          await metricsService.store(projectId, latest);
          send({ type: 'metrics', data: latest });
        }
      } catch { /* agent may be down, non-fatal */ }
    }, 10000);

    ws.on('close', () => {
      if (pollInterval) clearInterval(pollInterval);
    });

    ws.on('error', () => {
      if (pollInterval) clearInterval(pollInterval);
    });

  } catch (err: any) {
    console.error('[metrics] Error:', err.message);
    if (pollInterval) clearInterval(pollInterval);
    if (ws.readyState === ws.OPEN) {
      ws.close(1011, err.message);
    }
  }
}
