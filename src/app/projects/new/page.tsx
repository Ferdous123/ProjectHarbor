'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STEPS = ['Identity', 'Remote', 'Directories', 'Python', 'Jupyter', 'Notebook', 'Review'];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', description: '', category: 'research', tags: '',
    remoteDir: 'F:\\Research_Paper_Projects',
    agentHost: '127.0.0.1', agentPort: '9111', agentApiKey: '',
    jupyterPort: '8888', jupyterToken: '',
    jupyterNotebookDir: 'F:\\Research_Paper_Projects\\Thesis',
    pythonEnvPath: 'F:\\Research_Paper_Projects\\Thesis\\physicsdp_env',
    notebookPath: '',
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const createProject = async () => {
    try {
      const resp = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          category: form.category, remoteDir: form.remoteDir,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      const { data: project } = await resp.json();

      // Save settings (E7: agent.port, agent.apiKey, agent.host)
      await fetch(`/api/v1/projects/${project.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'agent.host': form.agentHost,
          'agent.port': form.agentPort,
          'agent.apiKey': form.agentApiKey,
          'jupyter.port': form.jupyterPort,
          'jupyter.token': form.jupyterToken,
          'jupyter.notebookDir': form.jupyterNotebookDir,
          'python.envPath': form.pythonEnvPath,
          'notebook.path': form.notebookPath,
        }),
      });

      toast.success('Project created!');
      router.push(`/projects/${project.id}`);
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    }
  };

  const testAgent = async () => {
    try {
      const resp = await fetch(`http://${form.agentHost}:${form.agentPort}/health`);
      if (resp.ok) toast.success('Agent is reachable!');
      else toast.error(`Agent returned ${resp.status}`);
    } catch {
      toast.error('Cannot reach agent — is it running?');
    }
  };

  return (
    <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-6 justify-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono transition-colors ${
                i < step ? 'bg-accent-green text-bg-0' :
                i === step ? 'bg-accent-blue text-white' :
                'bg-bg-3 text-text-tertiary'
              }`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-4 h-px ${i < step ? 'bg-accent-green' : 'bg-bg-4'}`} />}
            </div>
          ))}
        </div>

        <div className="border border-bg-4 rounded bg-bg-1 p-6 space-y-4">
          <h2 className="text-sm font-medium text-text-primary">{STEPS[step]}</h2>

          {/* Step 0: Identity */}
          {step === 0 && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Project Name *</Label>
                <Input value={form.name} onChange={set('name')} placeholder="My Thesis" className="bg-bg-2 border-bg-4 text-sm h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Description</Label>
                <Textarea value={form.description} onChange={set('description')} className="bg-bg-2 border-bg-4 text-sm min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v ?? form.category })}>
                  <SelectTrigger className="h-8 text-sm bg-bg-2 border-bg-4"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="experiment">Experiment</SelectItem>
                    <SelectItem value="course">Course</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Tags (comma separated)</Label>
                <Input value={form.tags} onChange={set('tags')} placeholder="ml, physics, thesis" className="bg-bg-2 border-bg-4 text-sm h-8" />
              </div>
            </>
          )}

          {/* Step 1: Remote/Agent */}
          {step === 1 && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Project Directory</Label>
                <Input value={form.remoteDir} onChange={set('remoteDir')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-text-secondary">Agent Host</Label>
                  <Input value={form.agentHost} onChange={set('agentHost')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-text-secondary">Agent Port</Label>
                  <Input value={form.agentPort} onChange={set('agentPort')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Agent API Key</Label>
                <div className="flex gap-2">
                  <Input value={form.agentApiKey} onChange={set('agentApiKey')} type="password" className="bg-bg-2 border-bg-4 text-sm h-8 font-mono flex-1" placeholder="From pc-agent/API_KEY.txt" />
                  <Button size="sm" variant="outline" onClick={testAgent} className="h-8 text-xs">Test</Button>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Directories */}
          {step === 2 && (
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Project Root Directory</Label>
              <Input value={form.remoteDir} onChange={set('remoteDir')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
              <p className="text-xs text-text-tertiary">This is the root for all file operations and git commands.</p>
            </div>
          )}

          {/* Step 3: Python */}
          {step === 3 && (
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Python Virtual Env Path</Label>
              <Input value={form.pythonEnvPath} onChange={set('pythonEnvPath')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
              <p className="text-xs text-text-tertiary">e.g. F:\Research_Paper_Projects\Thesis\physicsdp_env</p>
            </div>
          )}

          {/* Step 4: Jupyter */}
          {step === 4 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-text-secondary">Jupyter Port</Label>
                  <Input value={form.jupyterPort} onChange={set('jupyterPort')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-text-secondary">Jupyter Token</Label>
                  <Input value={form.jupyterToken} onChange={set('jupyterToken')} type="password" className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-text-secondary">Notebook Directory</Label>
                <Input value={form.jupyterNotebookDir} onChange={set('jupyterNotebookDir')} className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
              </div>
            </>
          )}

          {/* Step 5: Notebook */}
          {step === 5 && (
            <div className="space-y-1">
              <Label className="text-xs text-text-secondary">Default Notebook Path (relative)</Label>
              <Input value={form.notebookPath} onChange={set('notebookPath')} placeholder="thesis.ipynb" className="bg-bg-2 border-bg-4 text-sm h-8 font-mono" />
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-2 text-xs font-mono">
              <div><span className="text-text-secondary">Name: </span><span className="text-text-primary">{form.name}</span></div>
              <div><span className="text-text-secondary">Dir: </span><span className="text-text-primary">{form.remoteDir}</span></div>
              <div><span className="text-text-secondary">Agent: </span><span className="text-text-primary">{form.agentHost}:{form.agentPort}</span></div>
              <div><span className="text-text-secondary">Jupyter: </span><span className="text-text-primary">:{form.jupyterPort}</span></div>
              <div><span className="text-text-secondary">Python env: </span><span className="text-text-primary">{form.pythonEnvPath}</span></div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="text-xs h-7">
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)} disabled={step === 0 && !form.name} className="text-xs h-7">
                Next<ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={createProject} className="text-xs h-7 bg-accent-green hover:bg-accent-green/90 text-bg-0">
                <Check className="w-3.5 h-3.5 mr-1" />Create Project
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
