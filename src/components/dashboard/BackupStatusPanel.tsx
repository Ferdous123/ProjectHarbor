'use client';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Check, X, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BackupStep {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
}

interface BackupHistoryEntry {
  id: string;
  backupType: string;
  status: string;
  message?: string;
  filesCount?: number;
  durationMs?: number;
  createdAt: number;
}

function StepIcon({ status }: { status: BackupStep['status'] }) {
  if (status === 'done') return <Check className="w-3 h-3 text-accent-green shrink-0" />;
  if (status === 'error') return <X className="w-3 h-3 text-accent-red shrink-0" />;
  if (status === 'running') return <RefreshCw className="w-3 h-3 text-accent-blue animate-spin shrink-0" />;
  if (status === 'skipped') return <span className="w-3 h-3 text-text-tertiary shrink-0 text-xs">—</span>;
  return <span className="w-3 h-3 rounded-full border border-bg-5 shrink-0" />;
}

function formatAge(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m ago`;
}

export default function BackupStatusPanel({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<BackupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<BackupHistoryEntry | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/backup?limit=10`);
      const d = await r.json();
      const rows: BackupHistoryEntry[] = d.data ?? [];
      setHistory(rows);
      setLastSuccess(rows.find((r) => r.status === 'success') ?? null);
    } catch {}
  }, [projectId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const startBackup = useCallback(() => {
    if (running) return;
    setRunning(true);
    setSteps([]);
    const es = new EventSource(`/api/v1/projects/${projectId}/backup`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.done) {
          setRunning(false);
          es.close();
          if (!data.skipped) {
            toast.success(`Pushed ${data.fileCount ?? 0} files (${data.hash ?? ''})`);
          }
          loadHistory();
          return;
        }
        if (data.error) {
          setRunning(false);
          es.close();
          toast.error(`Backup failed: ${data.error}`);
          loadHistory();
          return;
        }
        // Update step
        setSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === data.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data;
            return next;
          }
          return [...prev, data];
        });
      } catch {}
    };
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }, [projectId, running, loadHistory]);

  return (
    <div className="border border-bg-4 rounded bg-bg-1 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
          Backups
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setShowHistory((v) => !v)}
            className="h-5 px-1.5 text-xs text-text-tertiary"
          >
            <Clock className="w-3 h-3 mr-1" />History
          </Button>
          <Button
            variant={running ? 'secondary' : 'ghost'}
            size="sm"
            onClick={startBackup}
            disabled={running}
            className="h-5 px-2 text-xs"
          >
            {running ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
            {running ? 'Pushing...' : 'Push Now'}
          </Button>
        </div>
      </div>

      {/* Step progress */}
      {steps.length > 0 && (
        <div className="bg-bg-0 rounded p-2 space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <StepIcon status={step.status} />
              <span className={step.status === 'error' ? 'text-accent-red' : step.status === 'done' ? 'text-text-secondary' : 'text-text-primary'}>
                {step.label}
              </span>
              {step.detail && <span className="text-text-tertiary ml-auto">{step.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Last success */}
      {lastSuccess && steps.length === 0 && (
        <p className="text-xs text-text-tertiary">
          Last push: {formatAge(lastSuccess.createdAt)}
          {lastSuccess.message && <span className="font-mono ml-1 text-accent-blue">{lastSuccess.message.slice(0, 7)}</span>}
        </p>
      )}

      {/* History */}
      {showHistory && (
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-2">No backup history</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs">
                {h.status === 'success'
                  ? <Check className="w-3 h-3 text-accent-green shrink-0" />
                  : <X className="w-3 h-3 text-accent-red shrink-0" />}
                <span className="text-text-tertiary">{formatAge(h.createdAt)}</span>
                {h.status === 'success' && h.message && (
                  <span className="font-mono text-accent-blue">{h.message.slice(0, 7)}</span>
                )}
                {h.status !== 'success' && h.message && (
                  <span className="text-accent-red truncate">{h.message}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
