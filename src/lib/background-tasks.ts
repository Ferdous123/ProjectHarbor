/**
 * Background task tracker — non-blocking, observable from any component.
 * R8b: Backup status panel infrastructure.
 */

export type TaskStatus = 'idle' | 'running' | 'success' | 'error';

export interface BackgroundTask {
  id: string;
  label: string;
  status: TaskStatus;
  progress?: number;   // 0-100
  detail?: string;
  error?: string;
  startedAt?: number;
}

const tasks = new Map<string, BackgroundTask>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function startBackgroundTask(id: string, label: string, fn: () => Promise<void>) {
  tasks.set(id, { id, label, status: 'running', startedAt: Date.now() });
  notifyListeners();

  fn()
    .then(() => {
      tasks.set(id, { ...tasks.get(id)!, status: 'success' });
      notifyListeners();
      // Auto-clear after 5s
      setTimeout(() => { tasks.delete(id); notifyListeners(); }, 5000);
    })
    .catch((err: Error) => {
      tasks.set(id, { ...tasks.get(id)!, status: 'error', error: err.message });
      notifyListeners();
    });
}

export function updateBackgroundTask(id: string, updates: Partial<BackgroundTask>) {
  const existing = tasks.get(id);
  if (existing) {
    tasks.set(id, { ...existing, ...updates });
    notifyListeners();
  }
}

export function getBackgroundTasks(): BackgroundTask[] {
  return Array.from(tasks.values());
}

export function subscribeToBackgroundTasks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
