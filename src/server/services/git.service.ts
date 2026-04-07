import { execFile } from 'child_process';
import { promisify } from 'util';
import type { GitStatus, GitCommit, GitBranch } from '@/types';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('git', args, { cwd, windowsHide: true });
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message);
  }
}

export const gitService = {
  async status(repoPath: string): Promise<GitStatus> {
    const { stdout: porcelain } = await git(['status', '--porcelain', '-b'], repoPath);
    const lines = porcelain.trim().split('\n').filter(Boolean);

    let branch = 'HEAD';
    let ahead = 0;
    let behind = 0;
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        const rest = line.slice(3);
        const branchMatch = rest.match(/^([^.]+)/);
        if (branchMatch) branch = branchMatch[1].split('...')[0];
        const aheadMatch = rest.match(/\[ahead (\d+)/);
        const behindMatch = rest.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1]);
        if (behindMatch) behind = parseInt(behindMatch[1]);
      } else {
        const xy = line.slice(0, 2);
        const file = line.slice(3);
        if (xy === '??') {
          untracked.push(file);
        } else {
          if (xy[0] !== ' ' && xy[0] !== '?') staged.push(file);
          if (xy[1] !== ' ' && xy[1] !== '?') unstaged.push(file);
        }
      }
    }

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    };
  },

  async log(repoPath: string, limit = 20): Promise<GitCommit[]> {
    const { stdout } = await git(
      ['log', `--max-count=${limit}`, '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ai'],
      repoPath
    );
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, shortHash, message, author, date] = line.split('\x1f');
      return { hash, shortHash, message, author, date };
    });
  },

  async branches(repoPath: string): Promise<GitBranch[]> {
    const { stdout } = await git(['branch', '-a', '--no-color'], repoPath);
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const current = line.startsWith('*');
      const name = line.replace(/^\*?\s+/, '').replace('remotes/', '').trim();
      const remote = line.includes('remotes/');
      return { name, current, remote };
    });
  },

  async diff(repoPath: string, file?: string): Promise<string> {
    const args = ['diff', '--no-color'];
    if (file) args.push('--', file);
    const { stdout } = await git(args, repoPath);
    return stdout;
  },

  async pull(repoPath: string): Promise<string> {
    const { stdout } = await git(['pull', '--ff-only'], repoPath);
    return stdout.trim();
  },

  async push(repoPath: string): Promise<string> {
    const { stdout } = await git(['push'], repoPath);
    return stdout.trim();
  },

  async addAll(repoPath: string): Promise<void> {
    await git(['add', '-A'], repoPath);
  },

  async commit(repoPath: string, message: string): Promise<string> {
    const { stdout } = await git(['commit', '-m', message], repoPath);
    return stdout.trim();
  },

  async addAndCommit(repoPath: string, message: string): Promise<string> {
    await gitService.addAll(repoPath);
    return gitService.commit(repoPath, message);
  },

  async checkout(repoPath: string, branch: string): Promise<void> {
    await git(['checkout', branch], repoPath);
  },

  async createBranch(repoPath: string, branch: string): Promise<void> {
    await git(['checkout', '-b', branch], repoPath);
  },

  async deleteBranch(repoPath: string, branch: string): Promise<void> {
    await git(['branch', '-d', branch], repoPath);
  },

  async stash(repoPath: string): Promise<void> {
    await git(['stash'], repoPath);
  },

  async stashPop(repoPath: string): Promise<void> {
    await git(['stash', 'pop'], repoPath);
  },

  async isRepo(dirPath: string): Promise<boolean> {
    try {
      await git(['rev-parse', '--git-dir'], dirPath);
      return true;
    } catch {
      return false;
    }
  },

  async clone(url: string, destPath: string): Promise<void> {
    await git(['clone', url, destPath], process.cwd());
  },

  async init(dirPath: string): Promise<void> {
    await git(['init'], dirPath);
  },

  // F8: Notebook checkpoints
  async createTag(repoPath: string, tag: string): Promise<void> {
    await git(['tag', tag], repoPath);
  },

  async listTags(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await git(['tag', '-l', 'checkpoint-*', '--sort=-creatordate'], repoPath);
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  },

  async checkoutFile(repoPath: string, tag: string, file: string): Promise<void> {
    await git(['checkout', tag, '--', file], repoPath);
  },

  async add(repoPath: string, files: string[]): Promise<void> {
    await git(['add', ...files], repoPath);
  },
};
