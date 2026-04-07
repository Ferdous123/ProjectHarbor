// ============================================================
// ProjectHarbor — Central TypeScript Types
// ============================================================

// === Project ===

export type ProjectStatus = 'active' | 'inactive' | 'error';
export type ProjectCategory = 'research' | 'experiment' | 'course' | 'other';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  category: ProjectCategory;
  tags: string[];
  status: ProjectStatus;
  remoteDir: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  id: string;
  projectId: string;
  key: string;
  value: string;
}

// Known setting keys (for type safety)
export type SettingKey =
  | 'ssh.host'
  | 'ssh.port'
  | 'ssh.username'
  | 'ssh.privateKeyPath'
  | 'agent.host'
  | 'agent.port'
  | 'agent.apiKey'
  | 'jupyter.port'
  | 'jupyter.token'
  | 'jupyter.notebookDir'
  | 'git.remote'
  | 'git.branch'
  | 'python.envPath'
  | 'notebook.path'
  | 'notebook.colabUrl';

// === Jobs ===

export type JobType =
  | 'git_pull'
  | 'git_push'
  | 'git_commit'
  | 'jupyter_start'
  | 'jupyter_stop'
  | 'jupyter_restart'
  | 'notebook_push'
  | 'env_install'
  | 'env_create'
  | 'custom';

export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, any> | null;
  result: string | null;
  logs: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// === Metrics ===

export interface MetricPoint {
  id: number;
  projectId: string;
  timestamp: number;
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  gpuPercent: number | null;
  gpuVramUsedGb: number | null;
  gpuVramTotalGb: number | null;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

// === Notifications ===

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  projectId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// === Schedules ===

export type ScheduleStatus = 'active' | 'paused';

export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  cronExpr: string;
  jobType: JobType;
  jobParams: Record<string, any> | null;
  status: ScheduleStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// === Notes / Journal ===

export interface JournalEntry {
  id: string;
  projectId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Snippet {
  id: string;
  projectId: string;
  name: string;
  language: string;
  code: string;
  description: string | null;
  createdAt: string;
}

export interface Todo {
  id: string;
  projectId: string;
  text: string;
  done: boolean;
  createdAt: string;
}

// === Audit Log ===

export interface AuditEntry {
  id: number;
  projectId: string | null;
  action: string;
  actor: string;
  details: Record<string, any> | null;
  createdAt: string;
}

// ============================================================
// === Notebook Types (E1, E8) ===
// ============================================================

export interface JupyterMessage {
  header: {
    msg_id: string;
    session: string;
    username: string;
    date: string;
    msg_type: string;
    version: '5.3';
  };
  parent_header: JupyterMessage['header'] | Record<string, never>;
  metadata: Record<string, any>;
  content: Record<string, any>;
  buffers: any[];
  channel: 'shell' | 'iopub' | 'stdin' | 'control';
}

export interface Cell {
  id: string;
  type: 'code' | 'markdown' | 'raw';
  source: string; // always string internally; convert on load/save (E8)
  outputs: CellOutput[];
  executionCount: number | null;
  metadata: Record<string, any>;
  status: 'idle' | 'queued' | 'running' | 'done' | 'error';
  executionStartTime: number | null;
  collapsed: { input: boolean; output: boolean };
}

export type CellOutput =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { output_type: 'execute_result'; data: MimeBundle; execution_count: number; metadata: Record<string, any> }
  | { output_type: 'display_data'; data: MimeBundle; metadata: Record<string, any>; transient?: { display_id?: string } }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] };

export type MimeBundle = {
  'text/plain'?: string;
  'text/html'?: string;
  'image/png'?: string;
  'image/svg+xml'?: string;
  'image/jpeg'?: string;
  'application/json'?: any;
  'text/latex'?: string;
};

// .ipynb source field can be string or string[] (E8)
export function normalizeCellSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

// ============================================================
// === Agent Types ===
// ============================================================

export interface AgentHealth {
  status: string;
  uptime_sec: number;
  jupyter_running: boolean;
  jupyter_pid: number | null;
  jupyter_uptime_sec: number | null;
  hostname: string;
  agent_version: string;
  timestamp: number;
}

export interface AgentJupyterStatus {
  running: boolean;
  pid: number | null;
  port: number;
  uptime_sec: number | null;
  watchdog_enabled: boolean;
  manual_stop: boolean; // E4: true = user stopped manually, watchdog paused
}

export interface AgentMetrics {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  gpu_percent: number | null;
  gpu_vram_used_gb: number | null;
  gpu_vram_total_gb: number | null;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  timestamp: number;
}

export interface AgentProcess {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  status: string;
  create_time: number;
  cmdline: string;
}

// ============================================================
// === Kernel Relay Control Messages (server → client) ===
// ============================================================

export type KernelRelayMessage =
  | { type: 'kernel_connected'; kernelId: string; notebookPath: string }
  | { type: 'kernel_disconnected'; code: number; reason: string }
  | { type: 'kernel_reconnecting'; code: number; reason: string }
  | { type: 'kernel_error'; error: string };

// ============================================================
// === SSH / SFTP Types (optional — for multi-machine mode) ===
// ============================================================

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: number;
  permissions: string;
}

// ============================================================
// === Git Types ===
// ============================================================

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

// ============================================================
// === Environment Types ===
// ============================================================

export interface PythonEnv {
  name: string;
  path: string;
  pythonVersion: string;
  active: boolean;
}

export interface Package {
  name: string;
  version: string;
  latestVersion: string | null;
}

// ============================================================
// === API Response Shapes ===
// ============================================================

export interface ApiResponse<T> {
  data: T;
  meta?: {
    ms: number;
    total?: number;
    page?: number;
  };
}

export interface ApiError {
  error: string;
  code?: string;
}

// ============================================================
// === WebSocket Message Types ===
// ============================================================

export type TerminalMessage =
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number };

export type MetricsWsMessage =
  | { type: 'metrics'; data: AgentMetrics }
  | { type: 'history'; data: AgentMetrics[] };
