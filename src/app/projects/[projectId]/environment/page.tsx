'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function EnvironmentPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [newPkg, setNewPkg] = useState('');

  const loadPackages = () => {
    setLoading(true);
    fetch(`/api/v1/projects/${projectId}/environment?action=packages`)
      .then((r) => r.json())
      .then((d) => setPackages(d.data ?? []))
      .catch(() => toast.error('Failed to load packages'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPackages(); }, [projectId]);

  const install = async () => {
    if (!newPkg.trim()) return;
    setInstalling(newPkg);
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/environment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', package: newPkg }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      toast.success(`Installed ${newPkg}`);
      setNewPkg('');
      loadPackages();
    } catch (e: any) { toast.error(e.message); }
    finally { setInstalling(null); }
  };

  const uninstall = async (pkg: string) => {
    setInstalling(pkg);
    try {
      const resp = await fetch(`/api/v1/projects/${projectId}/environment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall', package: pkg }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      toast.success(`Uninstalled ${pkg}`);
      loadPackages();
    } catch (e: any) { toast.error(e.message); }
    finally { setInstalling(null); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h2 className="text-sm font-medium text-text-primary">Python Environment</h2>

      {/* Install */}
      <div className="flex gap-2">
        <Input
          value={newPkg}
          onChange={(e) => setNewPkg(e.target.value)}
          placeholder="Package name (e.g. numpy)"
          className="bg-bg-2 border-bg-4 text-sm h-8"
          onKeyDown={(e) => e.key === 'Enter' && install()}
        />
        <Button size="sm" onClick={install} disabled={!!installing || !newPkg} className="h-8 text-xs">
          {installing === newPkg ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Install
        </Button>
      </div>

      {/* Package list */}
      {loading ? (
        <div className="flex items-center gap-2 text-text-tertiary text-sm">
          <Loader className="w-4 h-4 animate-spin" /> Loading packages...
        </div>
      ) : (
        <div className="border border-bg-4 rounded bg-bg-2 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 border-b border-bg-4 text-xs text-text-secondary">
            <span>Package</span><span>Version</span><span />
          </div>
          <div className="max-h-96 overflow-y-auto">
            {packages.map((pkg) => (
              <div key={pkg.name} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 border-b border-bg-4/50 text-xs items-center hover:bg-bg-3">
                <span className="font-mono text-text-primary">{pkg.name}</span>
                <span className="font-mono text-text-secondary">{pkg.version}</span>
                <button
                  onClick={() => uninstall(pkg.name)}
                  disabled={!!installing}
                  className="text-text-tertiary hover:text-accent-red"
                >
                  {installing === pkg.name ? <Loader className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
