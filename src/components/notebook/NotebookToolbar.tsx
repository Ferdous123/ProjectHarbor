'use client';
import { Save, Play, SkipForward, Square, RefreshCw, Loader, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Cell } from '@/types';

type KernelStatus = 'idle' | 'busy' | 'starting' | 'dead' | 'reconnecting';

interface Props {
  saving: boolean;
  dirty: boolean;
  lastSaved: Date | null;
  kernelStatus: KernelStatus;
  isKernelConnected: boolean;
  activeCellType: Cell['type'] | null;
  cells?: Cell[];
  notebookPath?: string;
  onSave: () => void;
  onRunCell: () => void;
  onRunAll: () => void;
  onStop: () => void;
  onRestart: () => void;
  onCellTypeChange: (type: Cell['type']) => void;
  onCheckpoint?: () => void;
}

const statusColors: Record<KernelStatus, string> = {
  idle: 'text-accent-green',
  busy: 'text-accent-yellow',
  starting: 'text-accent-blue',
  dead: 'text-accent-red',
  reconnecting: 'text-accent-yellow',
};

function exportToPy(cells: Cell[]): string {
  return cells
    .filter(c => c.type === 'code')
    .map(c => `# %%\n${c.source}`)
    .join('\n\n');
}

export default function NotebookToolbar({
  saving, dirty, lastSaved, kernelStatus, isKernelConnected,
  activeCellType, cells = [], notebookPath = '',
  onSave, onRunCell, onRunAll, onStop, onRestart, onCellTypeChange, onCheckpoint,
}: Props) {
  const saveLabel = saving ? 'Saving...' : dirty ? 'Save *' : lastSaved ? '✓ Saved' : 'Save';

  const handleDownloadPy = () => {
    const code = exportToPy(cells);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (notebookPath.split('/').pop()?.replace('.ipynb', '') || 'notebook') + '.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-4 bg-bg-1 shrink-0 flex-wrap">
      {/* Save */}
      <Button
        variant="ghost" size="sm"
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1 text-xs h-7 px-2"
      >
        {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" strokeWidth={1.5} />}
        {saveLabel}
      </Button>

      <div className="w-px h-4 bg-bg-4 mx-0.5" />

      {/* Run controls */}
      <Button variant="ghost" size="sm" onClick={onRunCell} className="flex items-center gap-1 text-xs h-7 px-2">
        <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
        Run
      </Button>
      <Button variant="ghost" size="sm" onClick={onRunAll} className="flex items-center gap-1 text-xs h-7 px-2">
        <SkipForward className="w-3.5 h-3.5" strokeWidth={1.5} />
        Run All
      </Button>
      <Button variant="ghost" size="sm" onClick={onStop} className="flex items-center gap-1 text-xs h-7 px-2">
        <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
        Stop
      </Button>
      <Button variant="ghost" size="sm" onClick={onRestart} className="flex items-center gap-1 text-xs h-7 px-2 text-accent-yellow">
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        Restart
      </Button>

      <div className="w-px h-4 bg-bg-4 mx-0.5" />

      {/* Cell type */}
      {activeCellType && (
        <Select value={activeCellType} onValueChange={(v) => onCellTypeChange(v as Cell['type'])}>
          <SelectTrigger className="h-7 text-xs w-28 border-bg-4 bg-bg-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="code">Code</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="raw">Raw</SelectItem>
          </SelectContent>
        </Select>
      )}

      <div className="w-px h-4 bg-bg-4 mx-0.5" />

      {/* L5: Export */}
      <Button variant="ghost" size="sm" onClick={handleDownloadPy} className="flex items-center gap-1 text-xs h-7 px-2" title="Download as .py">
        <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
        .py
      </Button>

      {/* F8: Checkpoint */}
      {onCheckpoint && (
        <Button variant="ghost" size="sm" onClick={onCheckpoint} className="flex items-center gap-1 text-xs h-7 px-2 text-accent-blue" title="Create git checkpoint">
          📌 Checkpoint
        </Button>
      )}

      {/* Kernel status */}
      <div className="ml-auto flex items-center gap-1.5 text-xs">
        <span className={`${statusColors[kernelStatus]} flex items-center gap-1`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {kernelStatus}
        </span>
        {!isKernelConnected && <span className="text-text-tertiary">(disconnected)</span>}
      </div>
    </div>
  );
}
