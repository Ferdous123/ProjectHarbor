'use client';
import { useState, useEffect } from 'react';

export type AgentConnectionStatus = 'checking' | 'connected' | 'offline';

/**
 * Polls the agent health endpoint every 10s.
 * Returns 'checking' on first load, 'connected' if reachable, 'offline' if not.
 */
export function useAgentConnection(): AgentConnectionStatus {
  const [status, setStatus] = useState<AgentConnectionStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/v1/proxy/agent/health', {
          signal: AbortSignal.timeout(3000),
        });
        if (!cancelled) setStatus(res.ok ? 'connected' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
