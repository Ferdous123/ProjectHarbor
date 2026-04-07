'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Terminal, FolderOpen, GitBranch,
  Box, BookOpen, FileText, Clock, StickyNote,
  Settings, ChevronRight, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '',           label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/terminal',  label: 'Terminal',    icon: Terminal },
  { href: '/files',     label: 'Files',       icon: FolderOpen },
  { href: '/git',       label: 'Git',         icon: GitBranch },
  { href: '/notebook',  label: 'Notebook',    icon: BookOpen },
  { href: '/jupyter',   label: 'Jupyter',     icon: Activity },
  { href: '/environment', label: 'Environment', icon: Box },
  { href: '/processes', label: 'Processes',   icon: Activity },
  { href: '/schedules', label: 'Schedules',   icon: Clock },
  { href: '/notes',     label: 'Notes',       icon: StickyNote },
  { href: '/settings',  label: 'Settings',    icon: Settings },
];

interface SidebarProps {
  projectId: string;
  projectName: string;
}

export default function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <aside className="flex flex-col w-56 shrink-0 border-r border-bg-4 bg-bg-1 h-full">
      {/* Project title */}
      <div className="px-4 py-3 border-b border-bg-4">
        <Link href="/projects" className="flex items-center gap-1 text-text-secondary hover:text-text-primary text-xs mb-1">
          <ChevronRight className="w-3 h-3 rotate-180" /> Projects
        </Link>
        <span className="text-text-primary font-medium text-sm truncate block">{projectName}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const fullHref = `${base}${href}`;
          const isActive = href === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(fullHref);
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'text-accent-blue bg-bg-3 border-l-2 border-accent-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-2'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-bg-4 px-4 py-3">
        <Link href="/settings" className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary">
          <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
          App Settings
        </Link>
      </div>
    </aside>
  );
}
