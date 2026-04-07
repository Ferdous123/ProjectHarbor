'use client';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  label: string;
  value: number | null;
  unit?: string;
  detail?: string;
  history: number[];
  color?: string;
  warn?: number;
  danger?: number;
}

export default function MetricCard({
  label, value, unit = '%', detail, history,
  color = '#388bfd', warn = 75, danger = 90,
}: MetricCardProps) {
  const pct = value ?? 0;
  const displayColor = pct >= danger ? '#f85149' : pct >= warn ? '#d29922' : color;
  const data = history.map((v, i) => ({ i, v }));

  return (
    <div className="bg-bg-2 border border-bg-4 rounded p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary text-xs">{label}</span>
        <span className="font-mono text-sm font-semibold" style={{ color: displayColor }}>
          {value !== null ? `${Math.round(pct)}${unit}` : '—'}
        </span>
      </div>

      {/* Sparkline */}
      <div className="h-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="v"
              stroke={displayColor}
              fill={displayColor}
              fillOpacity={0.15}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {detail && <span className="text-text-tertiary text-xs">{detail}</span>}
    </div>
  );
}
