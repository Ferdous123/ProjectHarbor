import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/server/db/client';
import { notifications } from '@/server/db/schema';

export const notificationService = {
  async create(data: {
    projectId?: string;
    type?: string;
    title: string;
    message?: string;
    severity?: string;
    metadata?: Record<string, any>;
  }) {
    const db = getDb();
    const [row] = await db.insert(notifications).values({
      id: uuidv4(),
      projectId: data.projectId ?? null,
      type: data.type ?? 'info',
      title: data.title,
      message: data.message ?? '',
      severity: data.severity ?? 'info',
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    }).returning();
    return row;
  },

  async list(projectId?: string, unreadOnly = false) {
    const db = getDb();
    const conditions = [];
    if (projectId) conditions.push(eq(notifications.projectId, projectId));
    if (unreadOnly) conditions.push(eq(notifications.isRead, false));

    const q = db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100);
    if (conditions.length > 0) return q.where(and(...conditions));
    return q;
  },

  async markRead(id: string) {
    const db = getDb();
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  },

  async markAllRead(projectId?: string) {
    const db = getDb();
    const q = db.update(notifications).set({ isRead: true });
    if (projectId) return q.where(eq(notifications.projectId, projectId));
    return q;
  },

  async delete(id: string) {
    const db = getDb();
    await db.delete(notifications).where(eq(notifications.id, id));
  },

  async unreadCount(projectId?: string) {
    const rows = await notificationService.list(projectId, true);
    return rows.length;
  },
};
