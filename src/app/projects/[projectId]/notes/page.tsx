'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Save, Trash2, Check, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface JournalEntry { id: string; content: string; isPinned: boolean; updatedAt: string }
interface Todo { id: string; text: string; isDone: boolean; dueAt?: string }

export default function NotesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [saving, setSaving] = useState(false);

  const api = (path: string, opts?: RequestInit) =>
    fetch(`/api/v1/projects/${projectId}/${path}`, opts).then((r) => r.json());

  const loadEntries = () =>
    api('journal').then((d) => setEntries(d.data ?? []));

  const loadTodos = () =>
    api('todos').then((d) => setTodos(d.data ?? []));

  useEffect(() => { loadEntries(); loadTodos(); }, [projectId]);

  const saveEntry = async () => {
    if (!newEntry.trim()) return;
    setSaving(true);
    try {
      await api('journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newEntry }),
      });
      setNewEntry('');
      loadEntries();
      toast.success('Entry saved');
    } catch { toast.error('Failed to save entry'); }
    finally { setSaving(false); }
  };

  const deleteEntry = async (id: string) => {
    await api(`journal/${id}`, { method: 'DELETE' });
    loadEntries();
  };

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    await api('todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newTodo }),
    });
    setNewTodo('');
    loadTodos();
  };

  const toggleTodo = async (id: string, isDone: boolean) => {
    await api(`todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: !isDone }),
    });
    loadTodos();
  };

  const deleteTodo = async (id: string) => {
    await api(`todos/${id}`, { method: 'DELETE' });
    loadTodos();
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <Tabs defaultValue="journal">
        <TabsList className="bg-bg-2 border border-bg-4 mb-4">
          <TabsTrigger value="journal" className="text-xs">Journal</TabsTrigger>
          <TabsTrigger value="todos" className="text-xs">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="space-y-3">
          <div className="border border-bg-4 rounded bg-bg-2 p-3 space-y-2">
            <Textarea
              placeholder="Write a journal entry..."
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              className="bg-bg-3 border-bg-4 text-sm min-h-[80px]"
            />
            <Button size="sm" onClick={saveEntry} disabled={saving || !newEntry.trim()} className="text-xs h-7">
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving...' : 'Save entry'}
            </Button>
          </div>
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="border border-bg-4 rounded bg-bg-2 p-3 group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-text-primary whitespace-pre-wrap flex-1">{e.content}</p>
                  <button onClick={() => deleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent-red">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-text-tertiary mt-1">{new Date(e.updatedAt).toLocaleString()}</p>
              </div>
            ))}
            {entries.length === 0 && <p className="text-text-tertiary text-xs">No journal entries yet</p>}
          </div>
        </TabsContent>

        <TabsContent value="todos" className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Add a todo..."
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              className="bg-bg-2 border-bg-4 text-sm h-8"
            />
            <Button size="sm" onClick={addTodo} disabled={!newTodo.trim()} className="h-8 text-xs">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            {todos.map((t) => (
              <div key={t.id} className="flex items-center gap-2 border border-bg-4 rounded bg-bg-2 px-3 py-2 group">
                <button onClick={() => toggleTodo(t.id, t.isDone)} className="text-text-tertiary hover:text-accent-green">
                  {t.isDone ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Square className="w-3.5 h-3.5" />}
                </button>
                <span className={`text-sm flex-1 ${t.isDone ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{t.text}</span>
                <button onClick={() => deleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent-red">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {todos.length === 0 && <p className="text-text-tertiary text-xs">No todos yet</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
