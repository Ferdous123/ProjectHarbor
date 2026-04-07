'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  metadata?: string;
}

interface Action {
  label: string;
  href?: string;
  action?: () => void;
}

const icons: Record<string, React.ReactNode> = {
  info: <Info className="w-3.5 h-3.5 text-accent-blue" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow" />,
  error: <AlertCircle className="w-3.5 h-3.5 text-accent-red" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-accent-green" />,
};

function getNotificationActions(
  type: string,
  metadata: Record<string, any>,
  projectId: string,
  interruptKernel: () => void,
  restartKernel: () => void
): Action[] {
  switch (type) {
    case 'jupyter_crash':
      return [{ label: 'View Logs', href: `/projects/${projectId}/logs` }];
    case 'git_conflict':
    case 'backup_failure':
      return [{ label: 'Open Git', href: `/projects/${projectId}/git` }];
    case 'kernel_stuck':
      return [
        { label: 'Interrupt', action: interruptKernel },
        { label: 'Restart', action: restartKernel },
      ];
    case 'disk_alert':
      return [{ label: 'View Files', href: `/projects/${projectId}/files` }];
    case 'job_failure':
      return [{ label: 'View Job', href: `/projects/${projectId}` }];
    default:
      return [];
  }
}

export default function NotificationsPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/notifications`);
      const d = await r.json();
      const items: Notification[] = d.data ?? [];
      setNotifications(items);
      setUnread(items.filter((n) => !n.isRead).length);
    } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [projectId]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch(`/api/v1/projects/${projectId}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    load();
  };

  const markRead = async (id: string) => {
    await fetch(`/api/v1/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    });
    load();
  };

  // Stub kernel actions — these would be wired up via context in a full impl
  const interruptKernel = () => toast.info('Navigate to Notebook to interrupt kernel');
  const restartKernel = () => toast.info('Navigate to Notebook to restart kernel');

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="w-4 h-4" strokeWidth={1.5} />
        {unread > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center bg-accent-red border-0">
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 border border-bg-4 rounded bg-bg-1 shadow-lg z-50 flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-bg-4">
            <span className="text-xs font-medium text-text-primary">Notifications</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-text-tertiary hover:text-accent-blue flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-text-tertiary hover:text-text-primary ml-2">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-6">No notifications</p>
            ) : (
              notifications.map((n) => {
                let meta: Record<string, any> = {};
                try { meta = JSON.parse(n.metadata ?? '{}'); } catch {}
                const actions = getNotificationActions(n.type, meta, projectId, interruptKernel, restartKernel);

                return (
                  <div
                    key={n.id}
                    className={`px-3 py-2.5 border-b border-bg-4/50 hover:bg-bg-2 ${n.isRead ? 'opacity-60' : ''}`}
                    onClick={() => !n.isRead && markRead(n.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">{icons[n.type] ?? icons.info}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-primary font-medium truncate">{n.title}</p>
                        {(n.body || n.message) && (
                          <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{n.body ?? n.message}</p>
                        )}
                        <p className="text-xs text-text-tertiary/70 mt-0.5">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {/* R5: Action buttons */}
                        {actions.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {actions.map((a, i) => (
                              a.href ? (
                                <button
                                  key={i}
                                  onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(a.href!); }}
                                  className="text-xs px-2 py-0.5 rounded border border-bg-4 hover:border-accent-blue hover:text-accent-blue text-text-secondary transition-colors"
                                >
                                  {a.label}
                                </button>
                              ) : (
                                <button
                                  key={i}
                                  onClick={(e) => { e.stopPropagation(); a.action?.(); }}
                                  className="text-xs px-2 py-0.5 rounded border border-bg-4 hover:border-accent-blue hover:text-accent-blue text-text-secondary transition-colors"
                                >
                                  {a.label}
                                </button>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue shrink-0 mt-1.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
