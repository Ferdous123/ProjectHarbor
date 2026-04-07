'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SchedulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', taskType: 'git_pull', cronExpression: '0 * * * *' });

  const load = () =>
    fetch(`/api/v1/projects/${projectId}/schedules`).then((r) => r.json()).then((d) => setSchedules(d.data ?? []));

  useEffect(() => { load(); }, [projectId]);

  const create = async () => {
    const resp = await fetch(`/api/v1/projects/${projectId}/schedules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (!resp.ok) { toast.error('Failed to create schedule'); return; }
    toast.success('Schedule created');
    setShowForm(false);
    load();
  };

  const del = async (id: string) => {
    await fetch(`/api/v1/projects/${projectId}/schedules/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">Schedules</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="text-xs h-7"><Plus className="w-3.5 h-3.5 mr-1" />New</Button>
      </div>

      {showForm && (
        <div className="border border-bg-4 rounded bg-bg-2 p-3 space-y-2">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-bg-3 border-bg-4 text-sm h-8" />
          <Input placeholder="Cron expression" value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} className="bg-bg-3 border-bg-4 text-sm h-8 font-mono" />
          <div className="flex gap-1">
            <Button size="sm" onClick={create} className="text-xs h-7">Create</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="text-xs h-7">Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {schedules.map((s) => (
          <div key={s.id} className="border border-bg-4 rounded bg-bg-2 px-3 py-2 flex items-center gap-3">
            <span className={`w-1.5 h-1.5 rounded-full ${s.enabled ? 'bg-accent-green' : 'bg-bg-4'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary">{s.name}</p>
              <p className="text-xs text-text-tertiary font-mono">{s.cronExpression} · {s.taskType}</p>
            </div>
            {s.lastRunStatus && <span className={`text-xs ${s.lastRunStatus === 'success' ? 'text-accent-green' : 'text-accent-red'}`}>{s.lastRunStatus}</span>}
            <button onClick={() => del(s.id)} className="text-text-tertiary hover:text-accent-red"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
        {schedules.length === 0 && <p className="text-text-tertiary text-xs">No schedules yet</p>}
      </div>
    </div>
  );
}
