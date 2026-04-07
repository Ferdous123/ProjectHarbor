/**
 * File service — local filesystem operations (NOT SFTP).
 * Uses fs.promises. guardPath() on EVERY operation.
 */
import fs from 'fs';
import path from 'path';
import { guardPath } from '@/lib/guard-path';
import type { FileEntry } from '@/types';

export const fileService = {
  async listDir(basePath: string, relativePath = ''): Promise<FileEntry[]> {
    const safePath = guardPath(basePath, relativePath || '.');
    const entries = await fs.promises.readdir(safePath, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry) => {
        const full = path.join(safePath, entry.name);
        let size = 0;
        let modified = 0;
        try {
          const stat = await fs.promises.stat(full);
          size = stat.size;
          modified = stat.mtimeMs;
        } catch { /* ignore stat errors */ }

        return {
          name: entry.name,
          path: path.join(relativePath, entry.name).replace(/\\/g, '/'),
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          size,
          modified,
          permissions: '',
        } as FileEntry;
      })
    );
  },

  async readFile(basePath: string, relativePath: string): Promise<string> {
    const safePath = guardPath(basePath, relativePath);
    return fs.promises.readFile(safePath, 'utf-8');
  },

  async writeFile(basePath: string, relativePath: string, content: string): Promise<void> {
    const safePath = guardPath(basePath, relativePath);
    await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
    await fs.promises.writeFile(safePath, content, 'utf-8');
  },

  async deleteFile(basePath: string, relativePath: string): Promise<void> {
    const safePath = guardPath(basePath, relativePath);
    await fs.promises.unlink(safePath);
  },

  async deleteDir(basePath: string, relativePath: string): Promise<void> {
    const safePath = guardPath(basePath, relativePath);
    await fs.promises.rm(safePath, { recursive: true, force: true });
  },

  async createDir(basePath: string, relativePath: string): Promise<void> {
    const safePath = guardPath(basePath, relativePath);
    await fs.promises.mkdir(safePath, { recursive: true });
  },

  async rename(basePath: string, oldPath: string, newPath: string): Promise<void> {
    const safeOld = guardPath(basePath, oldPath);
    const safeNew = guardPath(basePath, newPath);
    await fs.promises.rename(safeOld, safeNew);
  },

  async exists(basePath: string, relativePath: string): Promise<boolean> {
    try {
      const safePath = guardPath(basePath, relativePath);
      await fs.promises.access(safePath);
      return true;
    } catch {
      return false;
    }
  },

  async stat(basePath: string, relativePath: string) {
    const safePath = guardPath(basePath, relativePath);
    return fs.promises.stat(safePath);
  },
};
