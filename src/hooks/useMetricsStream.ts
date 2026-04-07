'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export interface MetricPoint {
  collectedAt: number;
  cpuPercent: number | null;
  ramPercent: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  gpuPercent: number | null;
  gpuVramUsedGb: number | null;
  diskPercent?: number | null;
}

export function useMetricsStream(projectId: string) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [latest, setLatest] = useState<MetricPoint | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`ws://${window.location.host}/ws/metrics/${projectId}`);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); attemptsRef.current = 0; };
    ws.onclose = (e) => {
      setConnected(false);
      if (e.code !== 1000) {
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        setTimeout(connect, delay);
      }
    };
    ws.onerror = () => {};

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'history') {
          setMetrics(msg.data ?? []);
          if (msg.data?.length > 0) setLatest(msg.data[msg.data.length - 1]);
        } else if (msg.type === 'metrics') {
          setLatest(msg.data);
          setMetrics((prev) => {
            const next = [...prev, msg.data].slice(-288); // keep 48h at 10s interval
            return next;
          });
        }
      } catch { /* ignore */ }
    };
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close(1000);
    };
  }, [connect]);

  return { metrics, latest, connected };
}
