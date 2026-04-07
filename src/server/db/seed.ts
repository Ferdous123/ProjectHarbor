import { initDb, getDb } from './client';
import { appSettings } from './schema';

const DEFAULT_APP_SETTINGS: Array<{ key: string; value: string }> = [
  // UI preferences
  { key: 'theme', value: 'dark' },
  { key: 'font_size', value: '14' },
  { key: 'font_family', value: 'JetBrains Mono' },
  { key: 'sidebar_collapsed', value: 'false' },

  // Monitoring
  { key: 'metrics_interval_sec', value: '10' },
  { key: 'metrics_retention_hours', value: '48' },
  { key: 'alert_cpu_threshold', value: '90' },
  { key: 'alert_ram_threshold', value: '90' },
  { key: 'alert_disk_threshold', value: '90' },

  // Notifications
  { key: 'notifications_enabled', value: 'true' },
  { key: 'notify_on_job_complete', value: 'true' },
  { key: 'notify_on_jupyter_crash', value: 'true' },

  // Agent defaults
  { key: 'default_agent_port', value: '9111' },
  { key: 'default_jupyter_port', value: '8888' },

  // App
  { key: 'app_version', value: '2.0.0' },
  { key: 'onboarding_complete', value: 'false' },
];

export async function seed(): Promise<void> {
  initDb();
  const db = getDb();

  for (const setting of DEFAULT_APP_SETTINGS) {
    await db
      .insert(appSettings)
      .values({ key: setting.key, value: setting.value })
      .onConflictDoNothing();
  }

  console.log(`[seed] Inserted ${DEFAULT_APP_SETTINGS.length} default app settings`);
}

// Run directly: npx tsx src/server/db/seed.ts
if (require.main === module) {
  seed()
    .then(() => {
      console.log('[seed] Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] Error:', err);
      process.exit(1);
    });
}
