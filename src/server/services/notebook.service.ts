/**
 * Notebook service — reads/writes .ipynb via local filesystem.
 * Handles E8: cell.source can be string or string[].
 */
import fs from 'fs';
import path from 'path';
import { guardPath } from '@/lib/guard-path';
import { normalizeCellSource } from '@/types';
import type { Cell, CellOutput } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface NotebookDocument {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, any>;
  cells: Cell[];
}

function parseOutputs(rawOutputs: any[]): CellOutput[] {
  if (!Array.isArray(rawOutputs)) return [];
  return rawOutputs.map((o: any): CellOutput => {
    switch (o.output_type) {
      case 'stream':
        return { output_type: 'stream', name: o.name, text: normalizeCellSource(o.text) };
      case 'execute_result':
        return { output_type: 'execute_result', data: o.data ?? {}, execution_count: o.execution_count, metadata: o.metadata ?? {} };
      case 'display_data':
        return { output_type: 'display_data', data: o.data ?? {}, metadata: o.metadata ?? {}, transient: o.transient };
      case 'error':
        return { output_type: 'error', ename: o.ename, evalue: o.evalue, traceback: o.traceback ?? [] };
      default:
        return { output_type: 'stream', name: 'stdout', text: JSON.stringify(o) };
    }
  });
}

export const notebookService = {
  async load(basePath: string, relativePath: string): Promise<{ cells: Cell[]; metadata: Record<string, any> }> {
    const safePath = guardPath(basePath, relativePath);
    const raw = await fs.promises.readFile(safePath, 'utf-8');
    const ipynb = JSON.parse(raw);

    const cells: Cell[] = (ipynb.cells ?? []).map((c: any): Cell => ({
      id: c.id ?? uuidv4(),
      type: c.cell_type ?? 'code',
      source: normalizeCellSource(c.source ?? ''),
      outputs: parseOutputs(c.outputs ?? []),
      executionCount: c.execution_count ?? null,
      metadata: c.metadata ?? {},
      status: 'idle',
      executionStartTime: null,
      collapsed: { input: false, output: false },
    }));

    return { cells, metadata: ipynb.metadata ?? {} };
  },

  async save(
    basePath: string,
    relativePath: string,
    cells: Cell[],
    metadata: Record<string, any>
  ): Promise<void> {
    const safePath = guardPath(basePath, relativePath);

    const ipynb = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata,
      cells: cells.map((cell) => ({
        id: cell.id,
        cell_type: cell.type,
        source: cell.source,
        metadata: cell.metadata,
        ...(cell.type === 'code' ? {
          outputs: cell.outputs,
          execution_count: cell.executionCount,
        } : {}),
      })),
    };

    await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
    await fs.promises.writeFile(safePath, JSON.stringify(ipynb, null, 1), 'utf-8');
  },

  async listNotebooks(basePath: string, dir = ''): Promise<string[]> {
    const safePath = guardPath(basePath, dir || '.');
    const results: string[] = [];

    async function walk(currentPath: string, relative: string) {
      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await walk(path.join(currentPath, entry.name), entryRelative);
          } else if (entry.isFile() && entry.name.endsWith('.ipynb')) {
            results.push(entryRelative);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    await walk(safePath, dir);
    return results;
  },
};
