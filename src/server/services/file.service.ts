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

  async readFileBuffer(basePath: string, relativePath: string): Promise<Buffer> {
    const safePath = guardPath(basePath, relativePath);
    return fs.promises.readFile(safePath);
  },

  async searchFiles(
    basePath: string,
    query: string,
    extFilter?: string,
  ): Promise<Array<{ path: string; line: number; content: string }>> {
    if (!query.trim()) return [];
    const results: Array<{ path: string; line: number; content: string }> = [];
    const MAX_RESULTS = 500;
    const MAX_FILE_BYTES = 5 * 1024 * 1024;
    const TEXT_EXTS = new Set([
      'py', 'ipynb', 'txt', 'md', 'csv', 'tsv', 'json', 'yaml', 'yml',
      'toml', 'sh', 'bat', 'log', 'cfg', 'ini', 'r', 'rs', 'js', 'ts',
      'jsx', 'tsx', 'html', 'css', 'sql', 'tex',
    ]);
    const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.mypy_cache', 'dist', '.next']);
    const lowerQ = query.toLowerCase();
    const normExt = extFilter ? extFilter.toLowerCase().replace(/^\./, '') : '';

    const walk = async (dir: string, rel: string) => {
      if (results.length >= MAX_RESULTS) return;
      let entries: fs.Dirent[] = [];
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (results.length >= MAX_RESULTS) return;
        const fullPath = path.join(dir, e.name);
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(fullPath, relPath);
          continue;
        }
        if (!e.isFile()) continue;
        const fileExt = path.extname(e.name).slice(1).toLowerCase();
        if (normExt && fileExt !== normExt) continue;
        if (!normExt && !TEXT_EXTS.has(fileExt)) continue;
        let stat: fs.Stats | null = null;
        try { stat = await fs.promises.stat(fullPath); } catch { continue; }
        if (stat.size > MAX_FILE_BYTES) continue;
        let content = '';
        try { content = await fs.promises.readFile(fullPath, 'utf-8'); } catch { continue; }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQ)) {
            results.push({ path: relPath, line: i + 1, content: lines[i].trimEnd().slice(0, 200) });
            if (results.length >= MAX_RESULTS) return;
          }
        }
      }
    };

    await walk(basePath, '');
    return results;
  },
};
