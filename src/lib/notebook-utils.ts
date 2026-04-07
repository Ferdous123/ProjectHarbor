/**
 * Notebook utilities — pure functions for .ipynb parsing/serializing.
 * Implements: E1, E5, E8
 */
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'isomorphic-dompurify';
import Anser from 'anser';
import type { JupyterMessage, Cell, CellOutput, MimeBundle } from '@/types';
import { normalizeCellSource } from '@/types';

// ── E1: Full Jupyter message with ALL required header fields ──
export function createJupyterMessage(
  msgType: string,
  content: Record<string, any>,
  sessionId: string,
  channel: JupyterMessage['channel'] = 'shell'
): JupyterMessage {
  return {
    header: {
      msg_id: uuidv4(),
      session: sessionId,
      username: 'projectharbor',
      date: new Date().toISOString(),
      msg_type: msgType,
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content,
    buffers: [],
    channel,
  };
}

// ── E5: HTML sanitization — MUST use before dangerouslySetInnerHTML ──
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'div', 'span', 'p', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'img', 'a', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'sup', 'sub', 'style',
    ],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'href', 'target', 'colspan', 'rowspan', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
    ADD_TAGS: ['style'],
  });
}

// ── ANSI color conversion ──
export function ansiToHtml(text: string): string {
  return Anser.ansiToHtml(text, { use_classes: true } as any);
}

// ── MIME type priority ──
export function getMimeTypePreference(data: MimeBundle): keyof MimeBundle | null {
  if (data['text/html'])      return 'text/html';
  if (data['image/png'])      return 'image/png';
  if (data['image/svg+xml'])  return 'image/svg+xml';
  if (data['image/jpeg'])     return 'image/jpeg';
  if (data['text/latex'])     return 'text/latex';
  if (data['application/json']) return 'application/json';
  if (data['text/plain'])     return 'text/plain';
  return null;
}

// ── E8: Parse .ipynb JSON to Cell[] ──
function parseRawOutputs(rawOutputs: any[]): CellOutput[] {
  if (!Array.isArray(rawOutputs)) return [];
  return rawOutputs.map((o: any): CellOutput => {
    switch (o.output_type) {
      case 'stream':
        return { output_type: 'stream', name: o.name ?? 'stdout', text: normalizeCellSource(o.text ?? '') };
      case 'execute_result':
        return { output_type: 'execute_result', data: o.data ?? {}, execution_count: o.execution_count ?? 0, metadata: o.metadata ?? {} };
      case 'display_data':
        return { output_type: 'display_data', data: o.data ?? {}, metadata: o.metadata ?? {}, transient: o.transient };
      case 'error':
        return { output_type: 'error', ename: o.ename ?? '', evalue: o.evalue ?? '', traceback: o.traceback ?? [] };
      default:
        return { output_type: 'stream', name: 'stdout', text: String(o) };
    }
  });
}

export function parseNotebook(ipynb: any): { cells: Cell[]; metadata: Record<string, any> } {
  const cells: Cell[] = (ipynb.cells ?? []).map((c: any): Cell => ({
    id: c.id ?? uuidv4(),
    type: c.cell_type ?? 'code',
    source: normalizeCellSource(c.source ?? ''),
    outputs: parseRawOutputs(c.outputs ?? []),
    executionCount: c.execution_count ?? null,
    metadata: c.metadata ?? {},
    status: 'idle',
    executionStartTime: null,
    collapsed: { input: false, output: false },
  }));

  return { cells, metadata: ipynb.metadata ?? {} };
}

export function serializeNotebook(cells: Cell[], metadata: Record<string, any>) {
  return {
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
}

export function createCell(type: Cell['type'] = 'code'): Cell {
  return {
    id: uuidv4(),
    type,
    source: '',
    outputs: [],
    executionCount: null,
    metadata: {},
    status: 'idle',
    executionStartTime: null,
    collapsed: { input: false, output: false },
  };
}
