'use client';
import { useAgentConnection } from '@/hooks/useAgentConnection';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function AgentBanner() {
  const status = useAgentConnection();

  if (status === 'checking' || status === 'connected') return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 text-sm mb-4">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="flex-1">PC agent is starting up or offline. Retrying every 10s...</span>
      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
    </div>
  );
}
