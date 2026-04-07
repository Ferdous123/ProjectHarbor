'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VarInfo {
  type: string;
  size: string;
  repr: string;
}

interface Props {
  onClose: () => void;
  onExecuteSilent: (code: string) => Promise<string | null>;
  kernelIdle: boolean;
}

const INSPECT_CODE = `
import json as __h_json
__h_vars = {}
for __h_n in [n for n in dir() if not n.startswith('_')]:
    try:
        __h_o = eval(__h_n)
        __h_vars[__h_n] = {
            'type': type(__h_o).__name__,
            'size': str(getattr(__h_o, 'shape', getattr(__h_o, '__len__', lambda: '-')())),
            'repr': repr(__h_o)[:200]
        }
    except: pass
print(__h_json.dumps(__h_vars))
del __h_vars, __h_n, __h_o, __h_json
`.trim();

export default function VariableInspector({ onClose, onExecuteSilent, kernelIdle }: Props) {
  const [vars, setVars] = useState<Record<string, VarInfo>>({});
  const [loading, setLoading] = useState(false);
  const lastRefreshRef = useRef<number>(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 3000) return;
    lastRefreshRef.current = now;
    setLoading(true);
    try {
      const result = await onExecuteSilent(INSPECT_CODE);
      if (result) {
        const parsed = JSON.parse(result);
        setVars(parsed);
      }
    } catch {
      // ignore parse errors
    } finally {
      setLoading(false);
    }
  }, [onExecuteSilent]);

  // Auto-refresh when kernel goes idle (throttled)
  useEffect(() => {
    if (kernelIdle) {
      refresh();
    }
  }, [kernelIdle, refresh]);

  const sortedVars = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col w-72 shrink-0 border-l border-bg-4 bg-bg-1 h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-4">
        <span className="text-xs font-medium text-text-primary">Variables</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="h-6 w-6 p-0" title="Refresh">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedVars.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-6">
            {loading ? 'Inspecting...' : 'No variables. Run a cell first.'}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-1 border-b border-bg-4">
              <tr>
                <th className="text-left px-2 py-1 text-text-tertiary font-normal">Name</th>
                <th className="text-left px-2 py-1 text-text-tertiary font-normal">Type</th>
                <th className="text-left px-2 py-1 text-text-tertiary font-normal">Size</th>
              </tr>
            </thead>
            <tbody>
              {sortedVars.map(([name, info]) => (
                <tr key={name} className="border-b border-bg-4/30 hover:bg-bg-2" title={info.repr}>
                  <td className="px-2 py-1 font-mono text-accent-blue truncate max-w-[80px]">{name}</td>
                  <td className="px-2 py-1 text-text-secondary truncate max-w-[70px]">{info.type}</td>
                  <td className="px-2 py-1 text-text-tertiary truncate max-w-[60px]">{info.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
