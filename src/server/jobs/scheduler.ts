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

  // R8b: Auto git push — every 30 minutes (if enabled per project)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { projectService } = await import('@/server/services/project.service');
      const { gitBackupWithRetry } = await import('@/server/services/backup.service');
      const { notificationService } = await import('@/server/services/notification.service');
      const projects = await projectService.listProjects();
      for (const project of projects) {
        try {
          const settings = await projectService.getSettings(project.id);
          const autoGit = settings['backup.autoGitPush'];
          if (autoGit !== 'true') continue;
          const dir = project.remoteDir;
          if (!dir) continue;
          const result = await gitBackupWithRetry(project.id, dir, 3);
          if (!result.ok && result.error) {
            await notificationService.create({
              projectId: project.id,
              type: 'backup_failure',
              title: 'Auto git push failed',
              message: result.error,
              severity: 'error',
              metadata: { label: 'git_push', error: result.error },
            });
          }
        } catch { /* skip individual project errors */ }
      }
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
