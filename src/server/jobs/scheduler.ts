import cron from 'node-cron';

type ScheduledTask = ReturnType<typeof cron.schedule>;
const activeTasks = new Map<string, ScheduledTask>();

export function startScheduler(): void {
  // Metrics cleanup — runs every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const { metricsService } = await import('@/server/services/metrics.service');
      await metricsService.purgeOld(48);
    } catch { /* non-fatal */ }
  });

  console.log('[scheduler] Started');
}

export function registerTask(id: string, expression: string, fn: () => Promise<void>): void {
  const existing = activeTasks.get(id);
  if (existing) existing.stop();

  const task = cron.schedule(expression, async () => {
    try { await fn(); } catch (e) { console.error(`[scheduler] Task ${id} failed:`, e); }
  });
  activeTasks.set(id, task);
}

export function unregisterTask(id: string): void {
  const task = activeTasks.get(id);
  if (task) { task.stop(); activeTasks.delete(id); }
}

export function stopAll(): void {
  for (const [, task] of activeTasks) task.stop();
  activeTasks.clear();
}
