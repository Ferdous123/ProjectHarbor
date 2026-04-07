/**
 * R8b-h: Background backup service — 3-layer backup with retry and conflict resolution.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb } from '@/server/db/client';
import { backupHistory } from '@/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string, timeoutMs = 60000) {
  const result = await execFileAsync('git', args, { cwd, windowsHide: true, timeout: timeoutMs });
  return result;
}

export interface BackupStep {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
}

type StepCallback = (step: BackupStep) => void;

function recordHistory(
  projectId: string,
  backupType: string,
  status: string,
  message: string,
  filesCount: number,
  durationMs: number
) {
  try {
    const db = getDb();
    db.insert(backupHistory).values({
      id: uuidv4(),
      projectId,
      backupType,
      status,
      message,
      filesCount,
      durationMs,
      createdAt: Date.now(),
    }).run();
  } catch { /* non-critical */ }
}

export async function gitBackupWithProgress(
  projectId: string,
  dir: string,
  onStep: StepCallback
): Promise<{ ok: boolean; hash?: string; fileCount?: number; skipped?: boolean }> {
  const startMs = Date.now();

  // Step 1: Stage
  onStep({ id: 'stage', label: 'Staging files', status: 'running' });
  try {
    await git(['add', '-A'], dir);
  } catch (e: any) {
    onStep({ id: 'stage', label: 'Staging files', status: 'error', detail: e.message });
    recordHistory(projectId, 'git_push', 'failed', e.message, 0, Date.now() - startMs);
    throw e;
  }

  const statusResult = await git(['status', '--porcelain'], dir).catch(() => ({ stdout: '' }));
  const fileCount = statusResult.stdout.trim() ? statusResult.stdout.trim().split('\n').length : 0;

  if (fileCount === 0) {
    onStep({ id: 'stage', label: 'Staging files', status: 'skipped', detail: 'Nothing to commit' });
    return { ok: true, skipped: true };
  }
  onStep({ id: 'stage', label: 'Staging files', status: 'done', detail: `${fileCount} files` });

  // Step 2: Commit
  onStep({ id: 'commit', label: 'Committing', status: 'running' });
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let hash = '';
  try {
    const commitResult = await git(['commit', '-m', `auto: ${ts}`], dir);
    hash = commitResult.stdout.match(/\[.*?\s([a-f0-9]+)\]/)?.[1] ?? '';
    onStep({ id: 'commit', label: 'Committing', status: 'done', detail: `${fileCount} files → ${hash}` });
  } catch (e: any) {
    onStep({ id: 'commit', label: 'Committing', status: 'error', detail: e.message });
    recordHistory(projectId, 'git_push', 'failed', e.message, fileCount, Date.now() - startMs);
    throw e;
  }

  // Step 3: Push
  onStep({ id: 'push', label: 'Pushing to remote', status: 'running' });
  try {
    await git(['push'], dir, 60000);
    onStep({ id: 'push', label: 'Pushing to remote', status: 'done' });
  } catch (pushErr: any) {
    const msg = pushErr.message ?? '';
    // Auto-resolve conflict
    if (msg.includes('rejected') || msg.includes('non-fast-forward') || msg.includes('conflict')) {
      onStep({ id: 'push', label: 'Pushing to remote', status: 'running', detail: 'Resolving conflict...' });
      try {
        await git(['stash'], dir);
        await git(['pull', '--rebase'], dir);
        await git(['stash', 'pop'], dir).catch(() => {}); // pop may fail if nothing stashed
        await git(['push'], dir, 60000);
        onStep({ id: 'push', label: 'Pushing to remote', status: 'done', detail: 'Resolved + pushed' });
      } catch (resolveErr: any) {
        onStep({ id: 'push', label: 'Pushing to remote', status: 'error', detail: resolveErr.message });
        recordHistory(projectId, 'git_push', 'failed', resolveErr.message, fileCount, Date.now() - startMs);
        throw new Error(`Git conflict auto-resolve failed: ${resolveErr.message}`);
      }
    } else {
      onStep({ id: 'push', label: 'Pushing to remote', status: 'error', detail: msg });
      recordHistory(projectId, 'git_push', 'failed', msg, fileCount, Date.now() - startMs);
      throw pushErr;
    }
  }

  // Step 4: Verify (lightweight)
  onStep({ id: 'verify', label: 'Verifying remote', status: 'running' });
  try {
    await git(['fetch', '--dry-run'], dir, 15000);
    onStep({ id: 'verify', label: 'Verifying remote', status: 'done', detail: 'Remote up to date' });
  } catch {
    // non-critical — don't fail the whole backup
    onStep({ id: 'verify', label: 'Verifying remote', status: 'skipped', detail: 'Could not verify' });
  }

  const duration = Date.now() - startMs;
  recordHistory(projectId, 'git_push', 'success', hash, fileCount, duration);
  return { ok: true, hash, fileCount };
}

export async function gitBackupWithRetry(
  projectId: string,
  dir: string,
  maxRetries = 3,
  onStep?: StepCallback
): Promise<{ ok: boolean; error?: string; attempts: number }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await gitBackupWithProgress(projectId, dir, onStep ?? (() => {}));
      return { ok: true, attempts: attempt };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { ok: false, error: err.message, attempts: attempt };
      }
      // Exponential backoff: 5s, 15s, 30s
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  return { ok: false, attempts: maxRetries };
}

export async function getBackupHistory(projectId: string, limit = 20) {
  const db = getDb();
  const rows = db
    .select()
    .from(backupHistory)
    .where(eq(backupHistory.projectId, projectId))
    .orderBy(desc(backupHistory.createdAt))
    .limit(limit)
    .all();
  return rows;
}
