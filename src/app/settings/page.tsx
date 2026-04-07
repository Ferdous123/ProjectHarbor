'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Monitor, Bell, Clock, Database, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type React from 'react';

interface SettingsField {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
}

const SETTINGS_GROUPS: Array<{ icon: React.ElementType; label: string; fields: SettingsField[] }> = [
  {
    icon: Monitor,
    label: 'Appearance',
    fields: [
      { key: 'theme', label: 'Theme', type: 'select', options: ['dark', 'light'] },
      { key: 'font_size', label: 'Font Size', type: 'select', options: ['12', '13', '14', '15', '16'] },
      { key: 'font_family', label: 'Font Family', type: 'select', options: ['geist-mono', 'monospace', 'fira-code', 'jetbrains-mono'] },
    ],
  },
  {
    icon: Sliders,
    label: 'Defaults',
    fields: [
      { key: 'default_agent_host', label: 'Default Agent Host', type: 'text' },
      { key: 'default_agent_port', label: 'Default Agent Port', type: 'text' },
      { key: 'default_jupyter_port', label: 'Default Jupyter Port', type: 'text' },
    ],
  },
  {
    icon: Clock,
    label: 'Metrics',
    fields: [
      { key: 'metrics_interval_sec', label: 'Polling Interval (sec)', type: 'text' },
      { key: 'metrics_retention_days', label: 'Retention (days)', type: 'text' },
      { key: 'cpu_alert_threshold', label: 'CPU Alert Threshold (%)', type: 'text' },
      { key: 'mem_alert_threshold', label: 'RAM Alert Threshold (%)', type: 'text' },
    ],
  },
  {
    icon: Bell,
    label: 'Notifications',
    fields: [
      { key: 'notify_on_job_complete', label: 'Notify on job complete', type: 'select', options: ['true', 'false'] },
      { key: 'notify_on_error', label: 'Notify on error', type: 'select', options: ['true', 'false'] },
    ],
  },
  {
    icon: Database,
    label: 'Autosave',
    fields: [
      { key: 'autosave_interval_sec', label: 'Autosave interval (sec)', type: 'text' },
    ],
  },
];

type SettingsMap = Record<string, string>;

export default function AppSettingsPage() {
  const [values, setValues] = useState<SettingsMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/v1/app').then((r) => r.json()).then((d) => setValues(d.data ?? {}));
  }, []);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/v1/app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!resp.ok) throw new Error('Save failed');
      toast.success('Settings saved');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-bg-0 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium text-text-primary">App Settings</h1>
          <Button size="sm" onClick={save} disabled={saving} className="text-xs h-7">
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {SETTINGS_GROUPS.map(({ icon: Icon, label, fields }) => (
          <div key={label} className="border border-bg-4 rounded bg-bg-1 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 text-text-secondary" />
              <h3 className="text-xs font-medium text-text-secondary">{label}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs text-text-secondary">{field.label}</Label>
                  {field.type === 'select' ? (
                    <Select value={values[field.key] ?? ''} onValueChange={(v) => set(field.key, v ?? '')}>
                      <SelectTrigger className="h-7 text-xs bg-bg-2 border-bg-4">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((o: string) => (
                          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={values[field.key] ?? ''}
                      onChange={(e) => set(field.key, e.target.value)}
                      className="h-7 text-xs bg-bg-2 border-bg-4 font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-text-tertiary text-center">
          ProjectHarbor · Running locally on this machine
        </p>
      </div>
    </div>
  );
}
