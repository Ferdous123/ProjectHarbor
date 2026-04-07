import { getDb } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const auditService = {
  async log(data: {
    projectId?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    outcome?: string;
    metadata?: Record<string, any>;
  }) {
    const db = getDb();
    await db.insert(auditEvents).values({
      projectId: data.projectId ?? null,
      action: data.action,
      targetType: data.targetType ?? null,
      targetId: data.targetId ?? null,
      outcome: data.outcome ?? 'success',
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
  },

  async list(projectId?: string, limit = 50) {
    const db = getDb();
    const q = db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
    if (projectId) {
      return q.where(eq(auditEvents.projectId, projectId));
    }
    return q;
  },
};
