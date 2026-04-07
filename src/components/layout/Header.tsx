'use client';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationsPanel from '@/components/notifications/NotificationsPanel';

interface HeaderProps {
  projectName: string;
  projectId: string;
  jupyterRunning?: boolean;
  agentOnline?: boolean;
}

export default function Header({
  projectName,
  projectId,
  jupyterRunning = false,
  agentOnline = false,
}: HeaderProps) {
  return (
    <header className="flex items-center h-12 px-4 border-b border-bg-4 bg-bg-1 shrink-0 gap-4">
      <span className="font-medium text-sm text-text-primary truncate">{projectName}</span>

      {/* Status pills */}
      <div className="flex items-center gap-2 text-xs shrink-0">
        <span className={`flex items-center gap-1 ${agentOnline ? 'text-accent-green' : 'text-text-tertiary'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Agent
        </span>
        <span className={`flex items-center gap-1 ${jupyterRunning ? 'text-accent-green' : 'text-text-tertiary'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Jupyter
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Link href={`/projects/${projectId}/settings`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <NotificationsPanel projectId={projectId} />
      </div>
    </header>
  );
}
