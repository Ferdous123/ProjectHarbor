'use client';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with xterm
const TerminalPane = dynamic(() => import('@/components/terminal/TerminalPane'), { ssr: false });

export default function TerminalPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="flex flex-col h-full bg-bg-0">
      <div className="flex items-center px-4 py-1.5 border-b border-bg-4 bg-bg-1">
        <span className="text-xs text-text-secondary font-mono">Terminal</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-text-tertiary">PowerShell</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <TerminalPane projectId={projectId} tabIndex={0} />
      </div>
    </div>
  );
}
