import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/server/db/client';
import { projects, projectSettings } from '@/server/db/schema';

export const projectService = {
  async listProjects() {
    const db = getDb();
    return db.select().from(projects).orderBy(desc(projects.updatedAt));
  },

  async getProject(id: string) {
    const db = getDb();
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
    return row;
  },

  async createProject(data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    remoteDir: string;
  }) {
    const db = getDb();
    const id = uuidv4();
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [row] = await db.insert(projects).values({
      id,
      name: data.name,
      slug,
      description: data.description ?? null,
      category: data.category ?? 'research',
      tags: JSON.stringify(data.tags ?? []),
      remoteDir: data.remoteDir,
    }).returning();
    return row;
  },

  async updateProject(id: string, data: Partial<{
    name: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    isPinned: boolean;
    remoteDir: string;
  }>) {
    const db = getDb();
    const update: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.category !== undefined) update.category = data.category;
    if (data.tags !== undefined) update.tags = JSON.stringify(data.tags);
    if (data.status !== undefined) update.status = data.status;
    if (data.isPinned !== undefined) update.isPinned = data.isPinned;
    if (data.remoteDir !== undefined) update.remoteDir = data.remoteDir;

    const [row] = await db.update(projects).set(update).where(eq(projects.id, id)).returning();
    if (!row) throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
    return row;
  },

  async deleteProject(id: string) {
    const db = getDb();
    await db.delete(projects).where(eq(projects.id, id));
  },

  async getSettings(projectId: string): Promise<Record<string, string>> {
    const db = getDb();
    const rows = await db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  async getSetting(projectId: string, key: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db.select().from(projectSettings).where(
      and(eq(projectSettings.projectId, projectId), eq(projectSettings.key, key))
    );
    return row?.value ?? null;
  },

  async setSetting(projectId: string, key: string, value: string) {
    const db = getDb();
    await db.insert(projectSettings).values({
      id: uuidv4(),
      projectId,
      key,
      value,
    }).onConflictDoUpdate({
      target: [projectSettings.projectId, projectSettings.key],
      set: { value, updatedAt: new Date().toISOString() },
    });
  },

  async setSettings(projectId: string, settings: Record<string, string>) {
    for (const [key, value] of Object.entries(settings)) {
      await projectService.setSetting(projectId, key, value);
    }
  },

  async touchActivity(projectId: string) {
    const db = getDb();
    await db.update(projects)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
  },
};
