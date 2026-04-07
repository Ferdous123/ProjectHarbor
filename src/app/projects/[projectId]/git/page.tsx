'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { GitBranch, GitPullRequestArrow, Upload, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function GitPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [status, setStatus] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const load = async () => {
    const [s, l] = await Promise.all([
      fetch(`/api/v1/projects/${projectId}/git?action=status`).then((r) => r.json()),
      fetch(`/api/v1/projects/${projectId}/git?action=log`).then((r) => r.json()),
    ]);
    setStatus(s.data);
    setLog(l.data ?? []);
  };

  useEffect(() => { load(); }, [projectId]);

  const action = async (label: string, fn: () => Promise<Response>) => {
    setLoading(label);
    try {
      const resp = await fn();
      if (!resp.ok) throw new Error((await resp.json()).error);
      toast.success(`${label} completed`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-text-secondary" />
        <span className="text-sm font-mono text-text-primary">{status?.branch ?? '...'}</span>
        {status?.ahead > 0 && <span className="text-xs text-accent-green">↑{status.ahead}</span>}
        {status?.behind > 0 && <span className="text-xs text-accent-red">↓{status.behind}</span>}
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={() => action('Pull', () => fetch(`/api/v1/projects/${projectId}/git`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull' }) }))} disabled={!!loading} className="text-xs h-7">
            <GitPullRequestArrow className="w-3.5 h-3.5 mr-1" />Pull
          </Button>
          <Button variant="outline" size="sm" onClick={() => action('Push', () => fetch(`/api/v1/projects/${projectId}/git`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push' }) }))} disabled={!!loading} className="text-xs h-7">
            <Upload className="w-3.5 h-3.5 mr-1" />Push
          </Button>
          <Button variant="ghost" size="sm" onClick={load} className="h-7 w-7 p-0"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="border border-bg-4 rounded bg-bg-2 p-3">
          <h3 className="text-xs text-text-secondary mb-2">Changed files</h3>
          {status.clean ? (
            <p className="text-xs text-accent-green">Working tree clean</p>
          ) : (
            <div className="space-y-0.5">
              {status.staged.map((f: string) => <div key={f} className="text-xs font-mono text-accent-green">M  {f}</div>)}
              {status.unstaged.map((f: string) => <div key={f} className="text-xs font-mono text-accent-red"> M {f}</div>)}
              {status.untracked.map((f: string) => <div key={f} className="text-xs font-mono text-text-tertiary">?? {f}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Commit */}
      <div className="border border-bg-4 rounded bg-bg-2 p-3 space-y-2">
        <h3 className="text-xs text-text-secondary">Commit</h3>
        <Textarea value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder="Commit message..." className="text-xs font-mono min-h-[60px] bg-bg-3 border-bg-4" />
        <Button size="sm" onClick={() => action('Commit', () => fetch(`/api/v1/projects/${projectId}/git`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'commit', message: commitMsg }) }))} disabled={!commitMsg || !!loading} className="text-xs h-7">
          Commit all changes
        </Button>
      </div>

      {/* Log */}
      <div className="border border-bg-4 rounded bg-bg-2 p-3">
        <h3 className="text-xs text-text-secondary mb-2">Recent commits</h3>
        <div className="space-y-1">
          {log.slice(0, 15).map((c) => (
            <div key={c.hash} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-accent-blue shrink-0">{c.shortHash}</span>
              <span className="text-text-primary truncate">{c.message}</span>
              <span className="text-text-tertiary shrink-0">{c.author}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
