'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProcessesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/v1/projects/${projectId}/processes`)
      .then((r) => r.json())
      .then((d) => setProcesses(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [projectId]);

  const kill = async (pid: number) => {
    try {
      await fetch(`/api/v1/projects/${projectId}/processes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }),
      });
      toast.success(`Killed PID ${pid}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Processes</h2>
        <Button variant="ghost" size="sm" onClick={load} className="h-7 w-7 p-0">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="border border-bg-4 rounded bg-bg-2 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-3 py-2 border-b border-bg-4 text-xs text-text-secondary">
          <span>PID</span><span>Name</span><span>CPU%</span><span>RAM (MB)</span><span />
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {processes.map((p) => (
            <div key={p.pid} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-3 py-1.5 border-b border-bg-4/50 text-xs items-center hover:bg-bg-3">
              <span className="font-mono text-text-tertiary">{p.pid}</span>
              <span className="text-text-primary truncate">{p.name}</span>
              <span className="font-mono text-accent-blue">{(p.cpu_percent ?? 0).toFixed(1)}</span>
              <span className="font-mono text-accent-green">{Math.round(p.memory_mb ?? 0)}</span>
              <button onClick={() => kill(p.pid)} className="text-text-tertiary hover:text-accent-red"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
