'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Play, Square, RefreshCw, Shield, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function JupyterPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/v1/projects/${projectId}/jupyter?action=status`)
      .then((r) => r.json())
      .then((d) => setStatus(d.data));

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [projectId]);

  const action = async (label: string, body: object) => {
    setLoading(label);
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/jupyter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      toast.success(label);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const running = status?.running ?? false;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <h2 className="text-sm font-medium text-text-primary">Jupyter Control</h2>

      {/* Status card */}
      <div className="border border-bg-4 rounded bg-bg-2 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${running ? 'bg-accent-green' : 'bg-bg-4'}`} />
          <span className="text-sm text-text-primary">{running ? 'Running' : 'Stopped'}</span>
          {status?.agent_unreachable && <span className="text-xs text-accent-yellow">(agent unreachable)</span>}
        </div>
        {running && (
          <div className="text-xs text-text-secondary space-y-1">
            <div>Port: <span className="font-mono text-text-primary">{status.port}</span></div>
            {status.pid && <div>PID: <span className="font-mono text-text-primary">{status.pid}</span></div>}
            {status.uptime_sec && <div>Uptime: <span className="font-mono text-text-primary">{Math.floor(status.uptime_sec / 60)}m {status.uptime_sec % 60}s</span></div>}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={() => action('Start Jupyter', { action: 'start' })} disabled={running || !!loading} className="flex items-center gap-1 text-xs">
          <Play className="w-3.5 h-3.5" />Start
        </Button>
        <Button variant="outline" size="sm" onClick={() => action('Stop Jupyter', { action: 'stop' })} disabled={!running || !!loading} className="flex items-center gap-1 text-xs">
          <Square className="w-3.5 h-3.5" />Stop
        </Button>
        <Button variant="outline" size="sm" onClick={() => action('Restart Jupyter', { action: 'restart' })} disabled={!!loading} className="flex items-center gap-1 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />Restart
        </Button>
      </div>

      {/* Watchdog */}
      <div className="border border-bg-4 rounded bg-bg-2 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-primary">Watchdog (auto-restart on crash)</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {status?.watchdog_enabled ? 'Enabled' : 'Disabled'}
              {status?.manual_stop ? ' — paused (manual stop)' : ''}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => action('Enable watchdog', { action: 'watchdog', watchdogAction: 'enable' })} className="text-xs h-7">
              <Shield className="w-3.5 h-3.5 mr-1" />Enable
            </Button>
            <Button variant="ghost" size="sm" onClick={() => action('Disable watchdog', { action: 'watchdog', watchdogAction: 'disable' })} className="text-xs h-7">
              <ShieldOff className="w-3.5 h-3.5 mr-1" />Disable
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
