'use client';
import { useState, useEffect } from 'react';
import { Save, Play, SkipForward, Square, RefreshCw, Loader, Download, Table2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Cell } from '@/types';

type KernelStatus = 'idle' | 'busy' | 'starting' | 'dead' | 'reconnecting';

interface Checkpoint { tag: string; message: string; date: string; commitHash?: string; }

interface Props {
  saving: boolean;
  dirty: boolean;
  lastSaved: Date | null;
  kernelStatus: KernelStatus;
  isKernelConnected: boolean;
  activeCellType: Cell['type'] | null;
  cells?: Cell[];
  notebookPath?: string;
  projectId?: string;
  showVarInspector?: boolean;
  onSave: () => void;
  onRunCell: () => void;
  onRunAll: () => void;
  onStop: () => void;
  onRestart: () => void;
  onCellTypeChange: (type: Cell['type']) => void;
  onCheckpoint?: () => void;
  onToggleVarInspector?: () => void;
}

const statusColors: Record<KernelStatus, string> = {
  idle: 'text-accent-green',
  busy: 'text-accent-yellow',
  starting: 'text-accent-blue',
  dead: 'text-accent-red',
  reconnecting: 'text-accent-yellow',
};

function exportToPy(cells: Cell[]): string {
  return cells.filter(c => c.type === 'code').map(c => `# %%\n${c.source}`).join('\n\n');
}

function exportToHtml(cells: Cell[]): string {
  const rows = cells.map((c) => {
    if (c.type === 'markdown') {
      return `<div class="cell markdown"><pre>${c.source.replace(/</g, '&lt;')}</pre></div>`;
    }
    const outputs = c.outputs.map((o: any) => {
      if (o.output_type === 'stream') return `<pre class="output">${String(o.text ?? '').replace(/</g, '&lt;')}</pre>`;
      if ((o.output_type === 'execute_result' || o.output_type === 'display_data') && o.data?.['text/plain']) {
        return `<pre class="output">${String(o.data['text/plain']).replace(/</g, '&lt;')}</pre>`;
      }
      return '';
    }).join('');
    return `<div class="cell code"><pre class="source">${c.source.replace(/</g, '&lt;')}</pre>${outputs}</div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notebook</title>
<style>body{font-family:monospace;background:#1a1a1a;color:#e0e0e0;padding:20px}
.cell{margin:10px 0;padding:10px;border:1px solid #333;border-radius:4px}
.code{border-color:#2a3a4a}.markdown{border-color:#2a4a2a}
.source{color:#7ec8e3;margin:0}.output{color:#b8d7a3;margin:5px 0 0;padding:5px;background:#111}
</style></head><body>${rows}</body></html>`;
}

export default function NotebookToolbar({
  saving, dirty, lastSaved, kernelStatus, isKernelConnected,
  activeCellType, cells = [], notebookPath = '', projectId = '',
  showVarInspector, onSave, onRunCell, onRunAll, onStop, onRestart,
  onCellTypeChange, onCheckpoint, onToggleVarInspector,
}: Props) {
  const saveLabel = saving ? 'Saving...' : dirty ? 'Save *' : lastSaved ? '✓ Saved' : 'Save';
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);

  // R3: Load checkpoints when dropdown opens
  useEffect(() => {
    if (!checkpointsOpen || !projectId) return;
    fetch(`/api/v1/projects/${projectId}/git?action=checkpoints`)
      .then(r => r.json())
      .then(d => setCheckpoints(d.data?.result?.checkpoints ?? []))
      .catch(() => {});
  }, [checkpointsOpen, projectId]);

  const handleRestoreCheckpoint = async (tag: string) => {
    if (!confirm(`Restore to checkpoint "${tag}"?\n\nCurrent changes will be committed first.`)) return;
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', tag, files: [notebookPath] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Restore failed');
      toast.success('Checkpoint restored — reload to see changes');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message}`);
    }
  };

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

  const handleDownloadHtml = () => {
    const html = exportToHtml(cells);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (notebookPath.split('/').pop()?.replace('.ipynb', '') || 'notebook') + '.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIpynb = async () => {
    try {
      const encodedPath = encodeURIComponent(notebookPath);
      const res = await fetch(`/api/v1/proxy/jupyter/api/contents/${encodedPath}?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch notebook from Jupyter');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.content, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = notebookPath.split('/').pop() || 'notebook.ipynb';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Download failed: ${e.message}`);
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-4 bg-bg-1 shrink-0 flex-wrap">
      {/* Save */}
      <Button variant="ghost" size="sm" onClick={onSave} disabled={saving} className="flex items-center gap-1 text-xs h-7 px-2">
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

      {/* R2: Variable inspector toggle */}
      {onToggleVarInspector && (
        <Button
          variant={showVarInspector ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleVarInspector}
          className="flex items-center gap-1 text-xs h-7 px-2"
          title="Variable Inspector (Ctrl+Shift+H)"
        >
          <Table2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          Vars
        </Button>
      )}

      {/* F8: Checkpoint */}
      {onCheckpoint && (
        <Button variant="ghost" size="sm" onClick={onCheckpoint} className="flex items-center gap-1 text-xs h-7 px-2 text-accent-blue" title="Create checkpoint">
          📌 Checkpoint
        </Button>
      )}

      {/* R3: Checkpoint restore */}
      {projectId && (
        <DropdownMenu onOpenChange={setCheckpointsOpen}>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1 text-xs h-7 px-2 rounded hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors"
            title="Restore checkpoint"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 text-xs">
            <div className="px-2 py-1.5 text-text-tertiary font-medium text-xs border-b border-bg-4">Checkpoints</div>
            {checkpoints.length === 0 ? (
              <div className="px-2 py-3 text-center text-text-tertiary text-xs">No checkpoints yet</div>
            ) : (
              checkpoints.map((cp) => (
                <DropdownMenuItem
                  key={cp.tag}
                  className="flex flex-col items-start gap-0.5 cursor-pointer"
                  onClick={() => handleRestoreCheckpoint(cp.tag)}
                >
                  <span className="font-medium text-text-primary">{cp.tag}</span>
                  <span className="text-text-tertiary text-xs">{cp.message} · {cp.date ? new Date(cp.date).toLocaleString() : ''}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* R8: Export/download menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1 text-xs h-7 px-2 rounded hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors"
          title="Download notebook"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <div className="px-2 py-1.5 text-text-tertiary font-medium text-xs border-b border-bg-4">Download as</div>
          <DropdownMenuItem onClick={handleDownloadIpynb} className="cursor-pointer">
            📓 Notebook (.ipynb)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadPy} className="cursor-pointer">
            🐍 Python script (.py)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadHtml} className="cursor-pointer">
            🌐 HTML (.html)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
