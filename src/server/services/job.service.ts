import { eq, desc, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/server/db/client';
import { jobs, jobLogs } from '@/server/db/schema';

export const jobService = {
  async create(data: {
    projectId: string;
    jobType: string;
    label?: string;
    input?: Record<string, any>;
    idempotencyKey?: string;
  }) {
    const db = getDb();
    const id = uuidv4();
    const [row] = await db.insert(jobs).values({
      id,
      projectId: data.projectId,
      jobType: data.jobType,
      status: 'pending',
      label: data.label ?? data.jobType,
      inputJson: data.input ? JSON.stringify(data.input) : null,
      idempotencyKey: data.idempotencyKey ?? null,
    }).returning();
    return row;
  },

  async start(jobId: string) {
    const db = getDb();
    const [row] = await db.update(jobs)
      .set({ status: 'running', startedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId))
      .returning();
    return row;
  },

  async complete(jobId: string, result?: Record<string, any>) {
    const db = getDb();
    const startedRow = await jobService.get(jobId);
    const durationMs = startedRow?.startedAt
      ? Date.now() - new Date(startedRow.startedAt).getTime()
      : null;

    const [row] = await db.update(jobs)
      .set({
        status: 'success',
        completedAt: new Date().toISOString(),
        resultJson: result ? JSON.stringify(result) : null,
        durationMs,
      })
      .where(eq(jobs.id, jobId))
      .returning();
    return row;
  },

  async fail(jobId: string, errorMessage: string) {
    const db = getDb();
    const startedRow = await jobService.get(jobId);
    const durationMs = startedRow?.startedAt
      ? Date.now() - new Date(startedRow.startedAt).getTime()
      : null;

    const [row] = await db.update(jobs)
      .set({
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage,
        durationMs,
      })
      .where(eq(jobs.id, jobId))
      .returning();
    return row;
  },

  async get(jobId: string) {
    const db = getDb();
    const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    return row ?? null;
  },

  async list(projectId: string, limit = 20) {
    const db = getDb();
    return db.select().from(jobs)
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  },

  async addLog(jobId: string, message: string, level: 'info' | 'warn' | 'error' = 'info', metadata?: Record<string, any>) {
    const db = getDb();
    // Get next seq
    const existing = await db.select().from(jobLogs).where(eq(jobLogs.jobId, jobId));
    const seq = existing.length;

    await db.insert(jobLogs).values({
      jobId,
      seq,
      level,
      message,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  },

  async getLogs(jobId: string) {
    const db = getDb();
    return db.select().from(jobLogs)
      .where(eq(jobLogs.jobId, jobId))
      .orderBy(jobLogs.seq);
  },

  /**
   * Run a job: create → start → execute fn → complete/fail
   */
  async run<T>(
    projectId: string,
    jobType: string,
    label: string,
    fn: (jobId: string) => Promise<T>
  ): Promise<{ jobId: string; result: T }> {
    const job = await jobService.create({ projectId, jobType, label });
    await jobService.start(job.id);
    try {
      const result = await fn(job.id);
      await jobService.complete(job.id, typeof result === 'object' && result !== null ? result as any : undefined);
      return { jobId: job.id, result };
    } catch (err: any) {
      await jobService.fail(job.id, err.message ?? 'Unknown error');
      throw err;
    }
  },
};
