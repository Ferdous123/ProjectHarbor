import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================
// projects
// ============================================================
export const projects = sqliteTable('projects', {
  id:             text('id').primaryKey(),
  name:           text('name').notNull(),
  slug:           text('slug').notNull().unique(),
  description:    text('description'),
  category:       text('category').notNull().default('research'),
  tags:           text('tags').notNull().default('[]'),    // JSON string[]
  status:         text('status').notNull().default('inactive'),
  isPinned:       integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  healthScore:    integer('health_score').default(100),
  remoteDir:      text('remote_dir').notNull().default(''),
  createdAt:      text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:      text('updated_at').notNull().default(sql`(datetime('now'))`),
  lastActivityAt: text('last_activity_at'),
});

// ============================================================
// project_settings  (E7: includes agent.port, agent.apiKey, agent.host)
// ============================================================
export const projectSettings = sqliteTable(
  'project_settings',
  {
    id:        text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    key:       text('key').notNull(),
    value:     text('value').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('uq_project_settings').on(t.projectId, t.key)]
);

// ============================================================
// jobs
// ============================================================
export const jobs = sqliteTable('jobs', {
  id:             text('id').primaryKey(),
  projectId:      text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  jobType:        text('job_type').notNull(),
  status:         text('status').notNull().default('pending'),
  label:          text('label'),
  inputJson:      text('input_json'),   // JSON
  resultJson:     text('result_json'),  // JSON
  errorMessage:   text('error_message'),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt:      text('created_at').notNull().default(sql`(datetime('now'))`),
  startedAt:      text('started_at'),
  completedAt:    text('completed_at'),
  durationMs:     integer('duration_ms'),
});

// ============================================================
// job_logs
// ============================================================
export const jobLogs = sqliteTable(
  'job_logs',
  {
    id:        integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    jobId:     text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    seq:       integer('seq').notNull().default(0),
    level:     text('level').notNull().default('info'),
    message:   text('message').notNull(),
    metadata:  text('metadata'),  // JSON
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_job_logs_job_id').on(t.jobId)]
);

// ============================================================
// audit_events
// ============================================================
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id:         integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    projectId:  text('project_id'),
    action:     text('action').notNull(),
    targetType: text('target_type'),
    targetId:   text('target_id'),
    outcome:    text('outcome').notNull().default('success'),
    metadata:   text('metadata'),  // JSON
    createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_audit_project').on(t.projectId)]
);

// ============================================================
// ssh_sessions
// ============================================================
export const sshSessions = sqliteTable(
  'ssh_sessions',
  {
    id:                  text('id').primaryKey(),
    projectId:           text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    machineKey:          text('machine_key').notNull().default('default'),
    status:              text('status').notNull().default('disconnected'),
    jupyterStatus:       text('jupyter_status').notNull().default('unknown'),
    jupyterPort:         integer('jupyter_port'),
    jupyterPid:          integer('jupyter_pid'),
    jupyterSessionStart: text('jupyter_session_start'),
    connectedAt:         text('connected_at'),
    lastHeartbeat:       text('last_heartbeat'),
    createdAt:           text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('uq_ssh_sessions').on(t.projectId, t.machineKey)]
);

// ============================================================
// notebook_versions
// ============================================================
export const notebookVersions = sqliteTable(
  'notebook_versions',
  {
    id:                text('id').primaryKey(),
    projectId:         text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    gitCommitHash:     text('git_commit_hash'),
    gitCommitMessage:  text('git_commit_message'),
    notebookPath:      text('notebook_path').notNull(),
    notebookSize:      integer('notebook_size'),
    committedAt:       text('committed_at'),
    pushedAt:          text('pushed_at'),
    isMilestone:       integer('is_milestone', { mode: 'boolean' }).notNull().default(false),
    milestoneLabel:    text('milestone_label'),
    createdAt:         text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_nb_versions_project').on(t.projectId)]
);

// ============================================================
// resource_metrics
// ============================================================
export const resourceMetrics = sqliteTable(
  'resource_metrics',
  {
    id:               integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    projectId:        text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    machineKey:       text('machine_key').notNull().default('default'),
    collectedAt:      integer('collected_at').notNull(),  // unix timestamp
    cpuPercent:       real('cpu_percent'),
    ramPercent:       real('ram_percent'),
    ramUsedGb:        real('ram_used_gb'),
    ramTotalGb:       real('ram_total_gb'),
    diskJson:         text('disk_json'),        // JSON
    gpuPercent:       real('gpu_percent'),
    gpuVramPercent:   real('gpu_vram_percent'),
    gpuVramUsedGb:    real('gpu_vram_used_gb'),
    netSentKbps:      real('net_sent_kbps'),
    netRecvKbps:      real('net_recv_kbps'),
    cpuTemp:          real('cpu_temp'),
    jupyterCpuPct:    real('jupyter_cpu_percent'),
    jupyterRamMb:     real('jupyter_ram_mb'),
  },
  (t) => [index('idx_metrics_project_time').on(t.projectId, t.collectedAt)]
);

// ============================================================
// scheduled_tasks
// ============================================================
export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id:              text('id').primaryKey(),
  projectId:       text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:            text('name').notNull(),
  taskType:        text('task_type').notNull(),
  enabled:         integer('enabled', { mode: 'boolean' }).notNull().default(true),
  cronExpression:  text('cron_expression'),
  intervalMinutes: integer('interval_minutes'),
  configJson:      text('config_json'),  // JSON
  lastRunAt:       text('last_run_at'),
  lastRunStatus:   text('last_run_status'),
  lastRunMessage:  text('last_run_message'),
  nextRunAt:       text('next_run_at'),
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:       text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// notifications
// ============================================================
export const notifications = sqliteTable(
  'notifications',
  {
    id:        text('id').primaryKey(),
    projectId: text('project_id'),
    type:      text('type').notNull().default('info'),
    title:     text('title').notNull(),
    message:   text('message').notNull().default(''),
    severity:  text('severity').notNull().default('info'),
    isRead:    integer('is_read', { mode: 'boolean' }).notNull().default(false),
    metadata:  text('metadata'),  // JSON
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_notifications_project').on(t.projectId)]
);

// ============================================================
// journal_entries
// ============================================================
export const journalEntries = sqliteTable(
  'journal_entries',
  {
    id:        text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    content:   text('content').notNull().default(''),
    isPinned:  integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_journal_project').on(t.projectId)]
);

// ============================================================
// todos
// ============================================================
export const todos = sqliteTable(
  'todos',
  {
    id:          text('id').primaryKey(),
    projectId:   text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    text:        text('text').notNull(),
    isDone:      integer('is_done', { mode: 'boolean' }).notNull().default(false),
    dueAt:       text('due_at'),
    createdAt:   text('created_at').notNull().default(sql`(datetime('now'))`),
    completedAt: text('completed_at'),
  },
  (t) => [index('idx_todos_project').on(t.projectId)]
);

// ============================================================
// snippets
// ============================================================
export const snippets = sqliteTable(
  'snippets',
  {
    id:         text('id').primaryKey(),
    projectId:  text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    label:      text('label').notNull(),
    category:   text('category').notNull().default('general'),
    content:    text('content').notNull(),
    type:       text('type').notNull().default('code'),
    isRunnable: integer('is_runnable', { mode: 'boolean' }).notNull().default(false),
    createdAt:  text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_snippets_project').on(t.projectId)]
);

// ============================================================
// file_bookmarks
// ============================================================
export const fileBookmarks = sqliteTable(
  'file_bookmarks',
  {
    id:        text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    path:      text('path').notNull(),
    label:     text('label').notNull().default(''),
    source:    text('source').notNull().default('local'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('uq_file_bookmarks').on(t.projectId, t.source, t.path)]
);

// ============================================================
// recent_files
// ============================================================
export const recentFiles = sqliteTable(
  'recent_files',
  {
    id:         text('id').primaryKey(),
    projectId:  text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    path:       text('path').notNull(),
    source:     text('source').notNull().default('local'),
    accessedAt: text('accessed_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('uq_recent_files').on(t.projectId, t.source, t.path)]
);

// ============================================================
// alert_thresholds
// ============================================================
export const alertThresholds = sqliteTable(
  'alert_thresholds',
  {
    id:              text('id').primaryKey(),
    projectId:       text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    metric:          text('metric').notNull(),
    thresholdValue:  real('threshold_value').notNull(),
    comparison:      text('comparison').notNull().default('gt'),
    enabled:         integer('enabled', { mode: 'boolean' }).notNull().default(true),
    cooldownMinutes: integer('cooldown_minutes').notNull().default(30),
    lastTriggeredAt: text('last_triggered_at'),
    createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('uq_alert_thresholds').on(t.projectId, t.metric)]
);

// ============================================================
// terminal_sessions
// ============================================================
export const terminalSessions = sqliteTable(
  'terminal_sessions',
  {
    id:           text('id').primaryKey(),
    projectId:    text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    tabIndex:     integer('tab_index').notNull().default(0),
    label:        text('label').notNull().default('Terminal'),
    status:       text('status').notNull().default('inactive'),
    historyJson:  text('history_json'),  // scrollback buffer JSON
    createdAt:    text('created_at').notNull().default(sql`(datetime('now'))`),
    lastActivity: text('last_activity'),
  },
  (t) => [index('idx_terminal_project').on(t.projectId)]
);

// ============================================================
// process_watches
// ============================================================
export const processWatches = sqliteTable(
  'process_watches',
  {
    id:               text('id').primaryKey(),
    projectId:        text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    processName:      text('process_name').notNull(),
    alertOnStart:     integer('alert_on_start', { mode: 'boolean' }).notNull().default(false),
    alertOnStop:      integer('alert_on_stop', { mode: 'boolean' }).notNull().default(false),
    isPinned:         integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    lastSeenStatus:   text('last_seen_status'),
    lastSeenAt:       text('last_seen_at'),
    createdAt:        text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_pw_project').on(t.projectId)]
);

// ============================================================
// app_settings  (global, not per-project)
// ============================================================
export const appSettings = sqliteTable('app_settings', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
