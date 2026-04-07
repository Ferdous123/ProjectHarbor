'use client';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  cellCount: number;
  isConnected: boolean;
  dirty: boolean;
  saving: boolean;
  lastSaved: Date | null;
  notebookPath: string;
}

export default function NotebookStatusBar({ cellCount, isConnected, dirty, saving, lastSaved, notebookPath }: Props) {
  const saveStatus = saving
    ? 'Saving...'
    : dirty
    ? 'Unsaved changes'
    : lastSaved
    ? `Last saved: ${formatDistanceToNow(lastSaved, { addSuffix: true })}`
    : 'Not saved';

  return (
    <div className="flex items-center gap-4 px-3 py-1 border-t border-bg-4 bg-bg-1 text-xs text-text-tertiary shrink-0">
      <span className="truncate text-text-secondary">{notebookPath}</span>
      <span>{cellCount} cells</span>
      <span className={`flex items-center gap-1 ${isConnected ? 'text-accent-green' : 'text-text-tertiary'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
      <span className={dirty ? 'text-accent-yellow' : ''}>{saveStatus}</span>
    </div>
  );
}
