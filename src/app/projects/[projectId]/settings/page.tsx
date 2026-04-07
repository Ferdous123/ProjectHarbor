'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SETTINGS_FIELDS: Array<{ key: string; label: string; placeholder?: string; secret?: boolean; section: string }> = [
  // SSH (optional)
  { section: 'SSH (Optional)', key: 'ssh.host', label: 'Host', placeholder: '192.168.1.100' },
  { section: 'SSH (Optional)', key: 'ssh.port', label: 'Port', placeholder: '22' },
  { section: 'SSH (Optional)', key: 'ssh.username', label: 'Username' },
  // Agent (E7)
  { section: 'Agent', key: 'agent.host', label: 'Agent Host', placeholder: '127.0.0.1' },
  { section: 'Agent', key: 'agent.port', label: 'Agent Port', placeholder: '9111' },
  { section: 'Agent', key: 'agent.apiKey', label: 'API Key', secret: true },
  // Jupyter
  { section: 'Jupyter', key: 'jupyter.port', label: 'Port', placeholder: '8888' },
  { section: 'Jupyter', key: 'jupyter.token', label: 'Token', secret: true },
  { section: 'Jupyter', key: 'jupyter.notebookDir', label: 'Notebook Directory' },
  // Python
  { section: 'Python', key: 'python.envPath', label: 'Virtual Env Path' },
  // Git
  { section: 'Git', key: 'git.remote', label: 'Remote', placeholder: 'origin' },
  { section: 'Git', key: 'git.branch', label: 'Branch', placeholder: 'main' },
  // Notebook
  { section: 'Notebook', key: 'notebook.path', label: 'Default Notebook Path' },
];

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/projects/${projectId}/settings`)
      .then((r) => r.json())
      .then((d) => setValues(d.data ?? {}));
  }, [projectId]);

  const save = async () => {
    setSaving(true);
    try {
      // Don't send masked values (*** means unchanged)
      const toSave: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== '***') toSave[k] = v;
      }
      const resp = await fetch(`/api/v1/projects/${projectId}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSave),
      });
      if (!resp.ok) throw new Error('Save failed');
      toast.success('Settings saved');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const sections = [...new Set(SETTINGS_FIELDS.map((f) => f.section))];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Project Settings</h2>
        <Button size="sm" onClick={save} disabled={saving} className="text-xs h-7">
          <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {sections.map((section) => (
        <div key={section} className="border border-bg-4 rounded bg-bg-2 p-4 space-y-3">
          <h3 className="text-xs text-text-secondary font-medium">{section}</h3>
          <div className="grid grid-cols-2 gap-3">
            {SETTINGS_FIELDS.filter((f) => f.section === section).map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-text-secondary">{field.label}</Label>
                <Input
                  type={field.secret ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="bg-bg-3 border-bg-4 text-xs h-7 font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
