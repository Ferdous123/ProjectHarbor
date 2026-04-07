import { eq, desc, and, gt, lt } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { resourceMetrics } from '@/server/db/schema';
import { projectService } from './project.service';

async function getAgentBase(projectId: string): Promise<{ url: string; apiKey: string }> {
  const settings = await projectService.getSettings(projectId);
  const host = settings['agent.host'] || '127.0.0.1';
  const port = settings['agent.port'] || '9111';
  const apiKey = settings['agent.apiKey'] || '';
  return { url: `http://${host}:${port}`, apiKey };
}

export const metricsService = {
  async fetchFromAgent(projectId: string, hours = 1): Promise<any[]> {
    const { url, apiKey } = await getAgentBase(projectId);
    try {
      const resp = await fetch(`${url}/metrics?hours=${hours}`, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return [];
      return resp.json();
    } catch {
      return [];
    }
  },

  async fetchLatestFromAgent(projectId: string): Promise<any | null> {
    const { url, apiKey } = await getAgentBase(projectId);
    try {
      const resp = await fetch(`${url}/metrics/latest`, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  },

  async store(projectId: string, raw: any) {
    const db = getDb();
    await db.insert(resourceMetrics).values({
      projectId,
      collectedAt: raw.timestamp ?? Math.floor(Date.now() / 1000),
      cpuPercent:    raw.cpu_percent   ?? null,
      ramPercent:    raw.ram_percent   ?? null,
      ramUsedGb:     raw.ram_used_gb   ?? null,
      ramTotalGb:    raw.ram_total_gb  ?? null,
      diskJson:      raw.disk_json     ?? null,
      gpuPercent:    raw.gpu_percent   ?? null,
      gpuVramPercent:raw.gpu_vram_percent ?? null,
      gpuVramUsedGb: raw.gpu_vram_used_gb ?? null,
      netSentKbps:   raw.net_sent_kbps ?? null,
      netRecvKbps:   raw.net_recv_kbps ?? null,
      cpuTemp:       raw.cpu_temp      ?? null,
    });
  },

  async storeMany(projectId: string, rawList: any[]) {
    for (const raw of rawList) {
      await metricsService.store(projectId, raw);
    }
  },

  async getHistory(projectId: string, hours = 1) {
    const db = getDb();
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    return db.select().from(resourceMetrics)
      .where(and(eq(resourceMetrics.projectId, projectId), gt(resourceMetrics.collectedAt, since)))
      .orderBy(resourceMetrics.collectedAt);
  },

  async getLatest(projectId: string) {
    const db = getDb();
    const [row] = await db.select().from(resourceMetrics)
      .where(eq(resourceMetrics.projectId, projectId))
      .orderBy(desc(resourceMetrics.collectedAt))
      .limit(1);
    return row ?? null;
  },

  async purgeOld(hours = 48) {
    const db = getDb();
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
    await db.delete(resourceMetrics).where(lt(resourceMetrics.collectedAt, cutoff));
  },
};
