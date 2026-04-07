import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/server/db/client';
import { scheduledTasks } from '@/server/db/schema';

export const scheduleService = {
  async list(projectId: string) {
    const db = getDb();
    return db.select().from(scheduledTasks).where(eq(scheduledTasks.projectId, projectId));
  },

  async get(id: string) {
    const db = getDb();
    const [row] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id));
    if (!row) throw Object.assign(new Error('Schedule not found'), { code: 'NOT_FOUND' });
    return row;
  },

  async create(data: {
    projectId: string;
    name: string;
    taskType: string;
    cronExpression?: string;
    intervalMinutes?: number;
    config?: Record<string, any>;
    enabled?: boolean;
  }) {
    const db = getDb();
    const [row] = await db.insert(scheduledTasks).values({
      id: uuidv4(),
      projectId: data.projectId,
      name: data.name,
      taskType: data.taskType,
      enabled: data.enabled ?? true,
      cronExpression: data.cronExpression ?? null,
      intervalMinutes: data.intervalMinutes ?? null,
      configJson: data.config ? JSON.stringify(data.config) : null,
    }).returning();
    return row;
  },

  async update(id: string, data: Partial<{
    name: string;
    enabled: boolean;
    cronExpression: string;
    intervalMinutes: number;
    config: Record<string, any>;
  }>) {
    const db = getDb();
    const update: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) update.name = data.name;
    if (data.enabled !== undefined) update.enabled = data.enabled;
    if (data.cronExpression !== undefined) update.cronExpression = data.cronExpression;
    if (data.intervalMinutes !== undefined) update.intervalMinutes = data.intervalMinutes;
    if (data.config !== undefined) update.configJson = JSON.stringify(data.config);

    const [row] = await db.update(scheduledTasks).set(update).where(eq(scheduledTasks.id, id)).returning();
    return row;
  },

  async delete(id: string) {
    const db = getDb();
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, id));
  },

  async recordRun(id: string, status: string, message?: string) {
    const db = getDb();
    await db.update(scheduledTasks).set({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: status,
      lastRunMessage: message ?? null,
      updatedAt: new Date().toISOString(),
    }).where(eq(scheduledTasks.id, id));
  },
};
