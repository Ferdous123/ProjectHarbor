'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { parseNotebook, serializeNotebook, createCell } from '@/lib/notebook-utils';
import type { Cell } from '@/types';

class SaveConflictError extends Error { constructor() { super('Save conflict'); } }

export function useNotebook(projectId: string, notebookPath: string) {
  const [cells, setCells] = useState<Cell[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutingRef = useRef(false);

  // ── Load notebook ──
  useEffect(() => {
    if (!notebookPath) return;
    setLoading(true);

    const encodedPath = encodeURIComponent(notebookPath);
    fetch(`/api/v1/proxy/jupyter/api/contents/${encodedPath}?projectId=${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const { cells: parsed, metadata: meta } = parseNotebook(data.content);
        setCells(parsed);
        setMetadata(meta);
        if (parsed.length > 0) setActiveCellId(parsed[0].id);
      })
      .catch((e) => toast.error(`Failed to load notebook: ${e.message}`))
      .finally(() => setLoading(false));
  }, [projectId, notebookPath]);

  // ── Save notebook ──
  const save = useCallback(async (showToast = true) => {
    if (!notebookPath || saving) return;
    setSaving(true);

    try {
      const notebook = serializeNotebook(cells, metadata);
      const encodedPath = encodeURIComponent(notebookPath);
      const resp = await fetch(`/api/v1/proxy/jupyter/api/contents/${encodedPath}?projectId=${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: notebook, type: 'notebook', format: 'json' }),
      });

      if (resp.status === 409) throw new SaveConflictError();
      if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);

      setDirty(false);
      setLastSaved(new Date());
      if (showToast) toast.success('Notebook saved');

      // K4: Also save a .harbor-backup file (crash protection)
      try {
        await fetch(`/api/v1/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'write',
            path: `${notebookPath}.harbor-backup`,
            content: JSON.stringify(notebook, null, 2),
          }),
        });
      } catch { /* backup is best-effort, don't fail main save */ }

    } catch (e: any) {
      if (e instanceof SaveConflictError) {
        toast.error('File modified externally. Reload to get latest version.');
      } else {
        toast.error(`Save failed: ${e.message}`);
      }
    } finally {
      setSaving(false);
    }
  }, [cells, metadata, notebookPath, projectId, saving]);

  // ── Autosave (120s, skip if executing) ──
  useEffect(() => {
    if (!dirty) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      if (!isExecutingRef.current) save(false);
    }, 120000);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [dirty, save]);

  // ── Unsaved changes guard ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = 'You have unsaved changes.'; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const markDirty = () => setDirty(true);

  // ── Cell operations (mark dirty on structural changes) ──
  const updateCellSource = useCallback((id: string, source: string) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, source } : c));
    setDirty(true);
  }, []);

  const addCellAfter = useCallback((afterId: string | null, type: Cell['type'] = 'code') => {
    const newCell = createCell(type);
    setCells((prev) => {
      if (!afterId) return [...prev, newCell];
      const idx = prev.findIndex((c) => c.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, newCell);
      return next;
    });
    setActiveCellId(newCell.id);
    setDirty(true);
    return newCell.id;
  }, []);

  const addCellBefore = useCallback((beforeId: string, type: Cell['type'] = 'code') => {
    const newCell = createCell(type);
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === beforeId);
      const next = [...prev];
      next.splice(Math.max(0, idx), 0, newCell);
      return next;
    });
    setActiveCellId(newCell.id);
    setDirty(true);
    return newCell.id;
  }, []);

  const deleteCell = useCallback((id: string) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const next = prev.filter((c) => c.id !== id);
      if (next.length > 0) {
        setActiveCellId(next[Math.min(idx, next.length - 1)].id);
      }
      return next;
    });
    setDirty(true);
  }, []);

  const moveCellUp = useCallback((id: string) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setDirty(true);
  }, []);

  const moveCellDown = useCallback((id: string) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setDirty(true);
  }, []);

  const changeCellType = useCallback((id: string, type: Cell['type']) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, type, outputs: [] } : c));
    setDirty(true);
  }, []);

  const setCellStatus = useCallback((id: string, status: Cell['status']) => {
    setCells((prev) => prev.map((c) =>
      c.id === id ? {
        ...c,
        status,
        executionStartTime: status === 'running' ? Date.now() : c.executionStartTime,
      } : c
    ));
    isExecutingRef.current = status === 'running';
  }, []);

  const appendCellOutput = useCallback((id: string, output: Cell['outputs'][number]) => {
    setCells((prev) => prev.map((c) =>
      c.id === id ? { ...c, outputs: [...c.outputs, output] } : c
    ));
  }, []);

  const clearCellOutputs = useCallback((id: string) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, outputs: [] } : c));
  }, []);

  const setCellExecutionCount = useCallback((id: string, count: number) => {
    setCells((prev) => prev.map((c) => c.id === id ? { ...c, executionCount: count } : c));
  }, []);

  const clearAllOutputs = useCallback(() => {
    setCells((prev) => prev.map((c) => ({ ...c, outputs: [], executionCount: null })));
    setDirty(true);
  }, []);

  return {
    cells, metadata, loading, dirty, saving, lastSaved, activeCellId,
    setActiveCellId,
    save,
    updateCellSource,
    addCellAfter, addCellBefore, deleteCell, moveCellUp, moveCellDown,
    changeCellType, setCellStatus, appendCellOutput, clearCellOutputs,
    setCellExecutionCount, clearAllOutputs, markDirty,
  };
}
