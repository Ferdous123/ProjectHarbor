'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { GitPullRequestArrow, Upload, Play, Square, RefreshCw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { projectId: string }

async function callApi(projectId: string, path: string, body: object) {
  const resp = await fetch(`/api/v1/projects/${projectId}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error((await resp.json()).error ?? 'Request failed');
  return resp.json();
}

export default function QuickActions({ projectId }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setLoading(label);
    try {
      await fn();
      toast.success(`${label} completed`);
    } catch (e: any) {
      toast.error(`${label} failed: ${e.message}`);
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    { id: 'pull',    label: 'Git Pull',  icon: GitPullRequestArrow, fn: () => callApi(projectId, 'git', { action: 'pull' }) },
    { id: 'push',    label: 'Git Push',  icon: Upload,              fn: () => callApi(projectId, 'git', { action: 'push' }) },
    { id: 'start',   label: 'Start Jupyter', icon: Play,           fn: () => callApi(projectId, 'jupyter', { action: 'start' }) },
    { id: 'stop',    label: 'Stop Jupyter',  icon: Square,         fn: () => callApi(projectId, 'jupyter', { action: 'stop' }) },
    { id: 'restart', label: 'Restart',       icon: RefreshCw,      fn: () => callApi(projectId, 'jupyter', { action: 'restart' }) },
  ];

  return (
    <div className="bg-bg-2 border border-bg-4 rounded p-3">
      <h3 className="text-xs text-text-secondary mb-2">Quick Actions</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {actions.map(({ id, label, icon: Icon, fn }) => (
          <Button
            key={id}
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => run(label, fn)}
            className="flex items-center gap-1 text-xs h-8 border-bg-4 bg-bg-3 hover:bg-bg-4 text-text-secondary"
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {loading === label ? '...' : label}
          </Button>
        ))}
      </div>
    </div>
  );
}
