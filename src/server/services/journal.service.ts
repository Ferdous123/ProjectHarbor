import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/server/db/client';
import { journalEntries, todos, snippets } from '@/server/db/schema';

export const journalService = {
  // ── Journal entries ──
  async listEntries(projectId: string) {
    const db = getDb();
    return db.select().from(journalEntries)
      .where(eq(journalEntries.projectId, projectId))
      .orderBy(desc(journalEntries.updatedAt));
  },

  async createEntry(projectId: string, content: string, isPinned = false) {
    const db = getDb();
    const [row] = await db.insert(journalEntries).values({
      id: uuidv4(), projectId, content, isPinned,
    }).returning();
    return row;
  },

  async updateEntry(id: string, data: Partial<{ content: string; isPinned: boolean }>) {
    const db = getDb();
    const update: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (data.content !== undefined) update.content = data.content;
    if (data.isPinned !== undefined) update.isPinned = data.isPinned;
    const [row] = await db.update(journalEntries).set(update).where(eq(journalEntries.id, id)).returning();
    return row;
  },

  async deleteEntry(id: string) {
    const db = getDb();
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
  },

  // ── Todos ──
  async listTodos(projectId: string) {
    const db = getDb();
    return db.select().from(todos)
      .where(eq(todos.projectId, projectId))
      .orderBy(todos.createdAt);
  },

  async createTodo(projectId: string, text: string, dueAt?: string) {
    const db = getDb();
    const [row] = await db.insert(todos).values({
      id: uuidv4(), projectId, text, isDone: false, dueAt: dueAt ?? null,
    }).returning();
    return row;
  },

  async toggleTodo(id: string, isDone: boolean) {
    const db = getDb();
    const [row] = await db.update(todos).set({
      isDone,
      completedAt: isDone ? new Date().toISOString() : null,
    }).where(eq(todos.id, id)).returning();
    return row;
  },

  async deleteTodo(id: string) {
    const db = getDb();
    await db.delete(todos).where(eq(todos.id, id));
  },
};

export const snippetService = {
  async list(projectId: string) {
    const db = getDb();
    return db.select().from(snippets)
      .where(eq(snippets.projectId, projectId))
      .orderBy(snippets.label);
  },

  async create(data: {
    projectId: string;
    label: string;
    content: string;
    category?: string;
    type?: string;
    isRunnable?: boolean;
  }) {
    const db = getDb();
    const [row] = await db.insert(snippets).values({
      id: uuidv4(),
      projectId: data.projectId,
      label: data.label,
      content: data.content,
      category: data.category ?? 'general',
      type: data.type ?? 'code',
      isRunnable: data.isRunnable ?? false,
    }).returning();
    return row;
  },

  async update(id: string, data: Partial<{ label: string; content: string; category: string; isRunnable: boolean }>) {
    const db = getDb();
    const [row] = await db.update(snippets).set(data as any).where(eq(snippets.id, id)).returning();
    return row;
  },

  async delete(id: string) {
    const db = getDb();
    await db.delete(snippets).where(eq(snippets.id, id));
  },
};
