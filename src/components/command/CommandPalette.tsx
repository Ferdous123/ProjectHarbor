'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Terminal, FileCode, GitBranch, Cpu, Activity,
  Calendar, BookOpen, Settings, StickyNote, FolderOpen, Search,
  Play, Square, RefreshCw, Plus,
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string;
}

interface CommandPaletteProps {
  projectId: string;
}

export default function CommandPalette({ projectId }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const nav = (path: string) => () => { router.push(path); setOpen(false); };

  const jupyterAction = (action: string) => async () => {
    setOpen(false);
    await fetch(`/api/v1/projects/${projectId}/jupyter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  };

  const gitAction = (action: string) => async () => {
    setOpen(false);
    await fetch(`/api/v1/projects/${projectId}/git`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  };

  const ALL_COMMANDS: Command[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, action: nav(`/projects/${projectId}`), keywords: 'home overview' },
    { id: 'nav-notebook', label: 'Go to Notebook', icon: <FileCode className="w-4 h-4" />, action: nav(`/projects/${projectId}/notebook`), keywords: 'jupyter ipynb' },
    { id: 'nav-terminal', label: 'Go to Terminal', icon: <Terminal className="w-4 h-4" />, action: nav(`/projects/${projectId}/terminal`), keywords: 'shell console' },
    { id: 'nav-files', label: 'Go to Files', icon: <FolderOpen className="w-4 h-4" />, action: nav(`/projects/${projectId}/files`), keywords: 'explorer browser' },
    { id: 'nav-git', label: 'Go to Git', icon: <GitBranch className="w-4 h-4" />, action: nav(`/projects/${projectId}/git`), keywords: 'version control commit push pull' },
    { id: 'nav-jupyter', label: 'Go to Jupyter', icon: <Cpu className="w-4 h-4" />, action: nav(`/projects/${projectId}/jupyter`), keywords: 'kernel server' },
    { id: 'nav-env', label: 'Go to Environment', icon: <Activity className="w-4 h-4" />, action: nav(`/projects/${projectId}/environment`), keywords: 'python pip packages venv' },
    { id: 'nav-processes', label: 'Go to Processes', icon: <Activity className="w-4 h-4" />, action: nav(`/projects/${projectId}/processes`), keywords: 'task manager pid kill' },
    { id: 'nav-schedules', label: 'Go to Schedules', icon: <Calendar className="w-4 h-4" />, action: nav(`/projects/${projectId}/schedules`), keywords: 'cron task automation' },
    { id: 'nav-notes', label: 'Go to Notes', icon: <StickyNote className="w-4 h-4" />, action: nav(`/projects/${projectId}/notes`), keywords: 'journal todo tasks' },
    { id: 'nav-settings', label: 'Go to Project Settings', icon: <Settings className="w-4 h-4" />, action: nav(`/projects/${projectId}/settings`), keywords: 'config configuration' },
    { id: 'nav-app-settings', label: 'App Settings', icon: <Settings className="w-4 h-4" />, action: nav('/settings'), keywords: 'global preferences theme' },
    { id: 'nav-new-project', label: 'New Project', icon: <Plus className="w-4 h-4" />, action: nav('/projects/new'), keywords: 'create add' },
    { id: 'nav-projects', label: 'All Projects', icon: <BookOpen className="w-4 h-4" />, action: nav('/projects'), keywords: 'list home' },
    // Actions
    { id: 'jupyter-start', label: 'Start Jupyter', icon: <Play className="w-4 h-4 text-accent-green" />, action: jupyterAction('start'), keywords: 'launch run kernel' },
    { id: 'jupyter-stop', label: 'Stop Jupyter', icon: <Square className="w-4 h-4 text-accent-red" />, action: jupyterAction('stop'), keywords: 'kill shutdown' },
    { id: 'jupyter-restart', label: 'Restart Jupyter', icon: <RefreshCw className="w-4 h-4 text-accent-yellow" />, action: jupyterAction('restart'), keywords: 'reboot' },
    { id: 'git-pull', label: 'Git Pull', icon: <GitBranch className="w-4 h-4 text-accent-blue" />, action: gitAction('pull'), keywords: 'fetch sync update' },
  ];

  const filtered = query.trim()
    ? ALL_COMMANDS.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          c.keywords?.toLowerCase().includes(q)
        );
      })
    : ALL_COMMANDS;

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selected]?.action();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="relative w-full max-w-lg border border-bg-4 rounded-lg bg-bg-1 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-4">
          <Search className="w-4 h-4 text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          <kbd className="text-xs text-text-tertiary bg-bg-3 border border-bg-4 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[340px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-6">No commands found</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected ? 'bg-bg-3' : 'hover:bg-bg-2'
                }`}
                onClick={cmd.action}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="text-text-secondary shrink-0">{cmd.icon}</span>
                <span className="text-sm text-text-primary">{cmd.label}</span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-bg-4 px-4 py-2 flex items-center gap-4 text-xs text-text-tertiary">
          <span><kbd className="bg-bg-3 border border-bg-4 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-bg-3 border border-bg-4 rounded px-1">↵</kbd> select</span>
          <span className="ml-auto"><kbd className="bg-bg-3 border border-bg-4 rounded px-1">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
