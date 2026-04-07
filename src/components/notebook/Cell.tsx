'use client';
import { useRef, useEffect, useState, memo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { Play, ChevronUp, ChevronDown, Trash2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import CellOutput from './CellOutput';
import type { Cell as CellType } from '@/types';

interface Props {
  cell: CellType;
  isActive: boolean;
  onSelect: () => void;
  onRun: () => void;
  onSourceChange: (source: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTypeChange: (type: CellType['type']) => void;
  onToggleOutput: () => void;
}

function ExecutionCount({ cell }: { cell: CellType }) {
  if (cell.type !== 'code') return <div className="w-10" />;
  const text = cell.status === 'running' ? '[*]' : cell.executionCount !== null ? `[${cell.executionCount}]` : '[ ]';
  return (
    <span className="font-mono text-xs text-text-tertiary w-10 text-right shrink-0 pt-1">{text}</span>
  );
}

const Cell = memo(function Cell({
  cell, isActive, onSelect, onRun, onSourceChange, onDelete, onMoveUp, onMoveDown, onTypeChange, onToggleOutput,
}: Props) {
  const [editingMarkdown, setEditingMarkdown] = useState(false);
  const extensions = cell.type === 'markdown' ? [markdown()] : [python()];

  const borderClass =
    cell.status === 'running' ? 'cell-running' :
    cell.status === 'error'   ? 'cell-error' :
    isActive                  ? 'cell-active border-l-2 border-l-transparent' :
    'border-l-2 border-l-transparent';

  return (
    <div
      className={cn('group relative border border-bg-4 rounded mb-1 bg-bg-2', borderClass)}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2 px-2 pt-1.5 pb-0">
        {/* Gutter */}
        <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-4 text-text-tertiary hover:text-accent-blue transition-colors"
            title="Run cell (Shift+Enter)"
          >
            <Play className="w-3 h-3" strokeWidth={1.5} fill="currentColor" />
          </button>
          {/* Cell type indicator */}
          <span className="text-text-tertiary" style={{ fontSize: 9 }}>
            {cell.type[0].toUpperCase()}
          </span>
        </div>

        <ExecutionCount cell={cell} />

        {/* Cell content */}
        <div className="flex-1 min-w-0">
          {cell.type === 'markdown' && !editingMarkdown ? (
            <div
              className="prose prose-invert prose-sm max-w-none cursor-text py-1 min-h-[1.5rem]"
              onDoubleClick={() => setEditingMarkdown(true)}
            >
              {cell.source || <span className="text-text-tertiary italic text-xs">Double-click to edit markdown</span>}
            </div>
          ) : (
            <CodeMirror
              value={cell.source}
              onChange={onSourceChange}
              extensions={extensions}
              theme={oneDark}
              basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              className="text-sm"
              onBlur={() => { if (cell.type === 'markdown') setEditingMarkdown(false); }}
            />
          )}
        </div>

        {/* Cell toolbar (show on hover/active) */}
        <div className={cn('flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity', isActive && 'opacity-100')}>
          <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-4 text-text-tertiary">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-4 text-text-tertiary">
            <ChevronDown className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-4 text-accent-red">
            <Trash2 className="w-3 h-3" />
          </button>
          {cell.outputs.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onToggleOutput(); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-4 text-text-tertiary">
              <ChevronRight className={cn('w-3 h-3 transition-transform', cell.collapsed.output && 'rotate-90')} />
            </button>
          )}
        </div>
      </div>

      {/* Outputs */}
      <CellOutput outputs={cell.outputs} collapsed={cell.collapsed.output} />
    </div>
  );
});

export default Cell;
