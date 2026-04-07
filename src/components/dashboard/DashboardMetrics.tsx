'use client';
import { useMetricsStream, type MetricPoint } from '@/hooks/useMetricsStream';
import MetricCard from './MetricCard';

interface Props { projectId: string }

export default function DashboardMetrics({ projectId }: Props) {
  const { metrics, latest, connected } = useMetricsStream(projectId);

  const hist = (key: keyof MetricPoint) =>
    metrics.slice(-60).map((m) => (m[key] as number) ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-text-secondary">System Metrics</h3>
        <span className={`text-xs flex items-center gap-1 ${connected ? 'text-accent-green' : 'text-text-tertiary'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {connected ? 'Live' : 'Connecting...'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="CPU"
          value={latest?.cpuPercent ?? null}
          history={hist('cpuPercent')}
          color="#388bfd"
        />
        <MetricCard
          label="RAM"
          value={latest?.ramPercent ?? null}
          detail={latest?.ramUsedGb ? `${latest.ramUsedGb.toFixed(1)} / ${(latest.ramTotalGb ?? 0).toFixed(0)} GB` : undefined}
          history={hist('ramPercent')}
          color="#3fb950"
        />
        <MetricCard
          label="GPU"
          value={latest?.gpuPercent ?? null}
          detail={latest?.gpuVramUsedGb ? `VRAM ${latest.gpuVramUsedGb.toFixed(1)} GB` : undefined}
          history={hist('gpuPercent')}
          color="#bc8cff"
        />
        <MetricCard
          label="Disk"
          value={latest?.diskPercent ?? null}
          history={hist('diskPercent')}
          color="#76e4f7"
          warn={80}
          danger={95}
        />
      </div>
    </div>
  );
}
