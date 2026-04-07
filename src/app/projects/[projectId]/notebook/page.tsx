'use client';
import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader, AlertTriangle } from 'lucide-react';
import { useNotebook } from '@/hooks/useNotebook';
import { useKernel } from '@/hooks/useKernel';
import Cell from '@/components/notebook/Cell';
import NotebookToolbar from '@/components/notebook/NotebookToolbar';
import NotebookStatusBar from '@/components/notebook/NotebookStatusBar';
import FindReplaceBar from '@/components/notebook/FindReplaceBar';
import VariableInspector from '@/components/notebook/VariableInspector';
import { Button } from '@/components/ui/button';
import type { Cell as CellType } from '@/types';

interface SearchResult { cellIndex: number; cellId: string; offset: number; }

function searchNotebook(cells: CellType[], query: string): SearchResult[] {
  if (!query) return [];
  try {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return cells.flatMap((cell, i) => {
      const matches = [...cell.source.matchAll(re)];
      return matches.map((m) => ({ cellIndex: i, cellId: cell.id, offset: m.index ?? 0 }));
    });
  } catch { return []; }
}

export default function NotebookPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const notebookPath = searchParams.get('path') ?? '';

  const nb = useNotebook(projectId, notebookPath);
  const [kernelStatusState, setKernelStatusState] = useState<'idle' | 'busy' | 'starting' | 'dead' | 'reconnecting'>('starting');
  const [stuckKernelSec, setStuckKernelSec] = useState(0);
  const busyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Find/replace state
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findResults, setFindResults] = useState<SearchResult[]>([]);
  const [findIndex, setFindIndex] = useState(0);

  // Variable inspector
  const [showVarInspector, setShowVarInspector] = useState(false);

  // Execution queue for Run All
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  // A4: Stuck kernel detection
  useEffect(() => {
    if (kernelStatusState === 'busy') {
      setStuckKernelSec(0);
      busyTimerRef.current = setInterval(() => {
        setStuckKernelSec(s => s + 1);
      }, 1000);
    } else {
      setStuckKernelSec(0);
      if (busyTimerRef.current) { clearInterval(busyTimerRef.current); busyTimerRef.current = null; }
    }
    return () => { if (busyTimerRef.current) clearInterval(busyTimerRef.current); };
  }, [kernelStatusState]);

  const kernelCallbacks = useCallback(() => ({
    onStatus: (s: any) => setKernelStatusState(s),
    onStream: (cellId: string, name: 'stdout' | 'stderr', text: string) => {
      nb.appendCellOutput(cellId, { output_type: 'stream', name, text });
    },
    onExecuteResult: (cellId: string, data: any, executionCount: number) => {
      nb.appendCellOutput(cellId, { output_type: 'execute_result', data, execution_count: executionCount, metadata: {} });
    },
    onDisplayData: (cellId: string, data: any) => {
      nb.appendCellOutput(cellId, { output_type: 'display_data', data, metadata: {} });
    },
    onError: (cellId: string, ename: string, evalue: string, traceback: string[]) => {
      nb.appendCellOutput(cellId, { output_type: 'error', ename, evalue, traceback });
      nb.setCellStatus(cellId, 'error');
    },
    onExecuteInput: (cellId: string, executionCount: number) => {
      nb.setCellExecutionCount(cellId, executionCount);
    },
    onClearOutput: (cellId: string) => {
      nb.clearCellOutputs(cellId);
    },
    onCellComplete: (cellId: string) => {
      nb.setCellStatus(cellId, 'done');
      runNextInQueue();
    },
  }), []); // eslint-disable-line

  const stableCallbacks = useRef(kernelCallbacks());
  useEffect(() => { stableCallbacks.current = kernelCallbacks(); }, [kernelCallbacks]);

  const kernel = useKernel(projectId, notebookPath, stableCallbacks.current);

  const runCell = useCallback(async (cellId: string) => {
    const cell = nb.cells.find((c) => c.id === cellId);
    if (!cell || cell.type !== 'code') return;
    nb.setCellStatus(cellId, 'running');
    nb.clearCellOutputs(cellId);
    await kernel.execute(cell.source, cellId);
  }, [nb, kernel]);

  const runNextInQueue = useCallback(() => {
    if (queueRef.current.length === 0) { runningRef.current = false; return; }
    const nextId = queueRef.current.shift()!;
    nb.setCellStatus(nextId, 'queued');
    runCell(nextId);
  }, [runCell, nb]);

  const runAll = useCallback(() => {
    const codeCells = nb.cells.filter((c) => c.type === 'code');
    if (codeCells.length === 0) return;
    queueRef.current = codeCells.slice(1).map((c) => c.id);
    runningRef.current = true;
    runCell(codeCells[0].id);
  }, [nb.cells, runCell]);

  // F8: Checkpoint handler
  const handleCheckpoint = useCallback(async () => {
    const label = window.prompt('Checkpoint label (optional):', 'checkpoint') ?? 'checkpoint';
    if (label === null) return;
    await nb.save(false);
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkpoint', message: label, files: [notebookPath] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Checkpoint failed');
      toast.success(`Checkpoint created: ${data.data?.result?.tag ?? label}`);
    } catch (e: any) {
      toast.error(`Checkpoint failed: ${e.message}`);
    }
  }, [nb, projectId, notebookPath]);

  const runActiveCell = useCallback(() => {
    if (!nb.activeCellId) return;
    runCell(nb.activeCellId);
    const idx = nb.cells.findIndex((c) => c.id === nb.activeCellId);
    if (idx < nb.cells.length - 1) nb.setActiveCellId(nb.cells[idx + 1].id);
  }, [nb, runCell]);

  // R1: Find results update
  useEffect(() => {
    const results = searchNotebook(nb.cells, findQuery);
    setFindResults(results);
    setFindIndex(0);
  }, [findQuery, nb.cells]);

  // Scroll to current find result
  useEffect(() => {
    if (findResults.length === 0) return;
    const result = findResults[findIndex];
    if (!result) return;
    nb.setActiveCellId(result.cellId);
    const el = cellRefs.current.get(result.cellId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [findIndex, findResults]); // eslint-disable-line

  const handleFindNext = useCallback(() => {
    if (findResults.length === 0) return;
    setFindIndex((i) => (i + 1) % findResults.length);
  }, [findResults.length]);

  const handleFindPrev = useCallback(() => {
    if (findResults.length === 0) return;
    setFindIndex((i) => (i - 1 + findResults.length) % findResults.length);
  }, [findResults.length]);

  const handleReplace = useCallback(() => {
    if (findResults.length === 0 || !nb.activeCellId) return;
    const result = findResults[findIndex];
    if (!result) return;
    const cell = nb.cells.find((c) => c.id === result.cellId);
    if (!cell) return;
    const re = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const newSource = cell.source.replace(re, replaceQuery);
    nb.updateCellSource(result.cellId, newSource);
  }, [findResults, findIndex, nb, findQuery, replaceQuery]);

  const handleReplaceAll = useCallback(() => {
    if (findResults.length === 0) return;
    const re = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    nb.cells.forEach((cell) => {
      if (re.test(cell.source)) {
        re.lastIndex = 0;
        nb.updateCellSource(cell.id, cell.source.replace(re, replaceQuery));
        re.lastIndex = 0;
      }
    });
    toast.success(`Replaced all in notebook`);
  }, [findResults, findQuery, replaceQuery, nb]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        nb.save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nb]);

  if (!notebookPath) {
    return (
      <div className="p-8 text-center text-text-secondary">
        <p>No notebook selected.</p>
        <p className="text-xs mt-2 text-text-tertiary">Open a notebook from the Files page.</p>
      </div>
    );
  }

  if (nb.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-6 h-6 animate-spin text-text-tertiary" />
        <span className="ml-2 text-text-secondary text-sm">Loading notebook...</span>
      </div>
    );
  }

  const activeCell = nb.cells.find((c) => c.id === nb.activeCellId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main notebook area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <NotebookToolbar
          saving={nb.saving}
          dirty={nb.dirty}
          lastSaved={nb.lastSaved}
          kernelStatus={kernelStatusState}
          isKernelConnected={kernel.isConnected}
          activeCellType={activeCell?.type ?? null}
          cells={nb.cells}
          notebookPath={notebookPath}
          projectId={projectId}
          showVarInspector={showVarInspector}
          onSave={() => nb.save()}
          onRunCell={runActiveCell}
          onRunAll={runAll}
          onStop={kernel.interrupt}
          onRestart={kernel.restart}
          onCellTypeChange={(type) => nb.activeCellId && nb.changeCellType(nb.activeCellId, type)}
          onCheckpoint={handleCheckpoint}
          onToggleVarInspector={() => setShowVarInspector((v) => !v)}
        />

        {/* R1: Find/replace bar */}
        {showFind && (
          <FindReplaceBar
            query={findQuery}
            replaceQuery={replaceQuery}
            resultCount={findResults.length}
            currentIndex={findIndex}
            showReplace={showReplace}
            onQueryChange={setFindQuery}
            onReplaceQueryChange={setReplaceQuery}
            onNext={handleFindNext}
            onPrev={handleFindPrev}
            onReplace={handleReplace}
            onReplaceAll={handleReplaceAll}
            onClose={() => { setShowFind(false); setFindQuery(''); setFindResults([]); }}
          />
        )}

        {/* A4: Stuck kernel warning */}
        {stuckKernelSec >= 60 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-400 text-xs shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Kernel busy for {stuckKernelSec}s — may be stuck.</span>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs ml-1 border-yellow-500/30 text-yellow-400"
              onClick={kernel.interrupt}>Interrupt</Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs border-yellow-500/30 text-yellow-400"
              onClick={kernel.restart}>Restart Kernel</Button>
          </div>
        )}

        {/* Cell list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-0">
          {nb.cells.map((cell) => (
            <div key={cell.id} ref={(el) => { if (el) cellRefs.current.set(cell.id, el); else cellRefs.current.delete(cell.id); }}>
              <Cell
                cell={cell}
                isActive={cell.id === nb.activeCellId}
                highlighted={findResults.some((r) => r.cellId === cell.id)}
                onSelect={() => nb.setActiveCellId(cell.id)}
                onRun={() => runCell(cell.id)}
                onSourceChange={(source) => nb.updateCellSource(cell.id, source)}
                onDelete={() => nb.deleteCell(cell.id)}
                onMoveUp={() => nb.moveCellUp(cell.id)}
                onMoveDown={() => nb.moveCellDown(cell.id)}
                onTypeChange={(type) => nb.changeCellType(cell.id, type)}
                onToggleOutput={() => {}}
              />
            </div>
          ))}

          {/* Add cell button */}
          <button
            onClick={() => nb.addCellAfter(nb.activeCellId)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-2 rounded border border-dashed border-bg-4 transition-colors mt-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add cell
          </button>
        </div>

        <NotebookStatusBar
          cellCount={nb.cells.length}
          isConnected={kernel.isConnected}
          dirty={nb.dirty}
          saving={nb.saving}
          lastSaved={nb.lastSaved}
          notebookPath={notebookPath}
        />
      </div>

      {/* R2: Variable inspector sidebar */}
      {showVarInspector && (
        <VariableInspector
          onClose={() => setShowVarInspector(false)}
          onExecuteSilent={kernel.executeSilent}
          kernelIdle={kernelStatusState === 'idle'}
        />
      )}
    </div>
  );
}
