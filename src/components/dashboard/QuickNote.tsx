'use client';
import { useState, useEffect, useCallback } from 'react';
import { StickyNote } from 'lucide-react';

const DEBOUNCE_MS = 2000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export default function QuickNote() {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/v1/app')
      .then((r) => r.json())
      .then((d) => { if (d.data?.quick_note) setNote(d.data.quick_note); })
      .catch(() => {});
  }, []);

  const save = useCallback(async (value: string) => {
    setSaving(true);
    try {
      await fetch('/api/v1/app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quick_note: value }),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNote(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => save(value), DEBOUNCE_MS);
  };

  return (
    <div className="border border-bg-4 rounded bg-bg-1 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <StickyNote className="w-3.5 h-3.5" strokeWidth={1.5} />
        Quick Notes
        {saving && <span className="ml-auto text-text-tertiary">Saving...</span>}
      </div>
      <textarea
        value={note}
        onChange={handleChange}
        placeholder="Quick notes — jot down ideas, TODOs, reminders..."
        className="w-full bg-bg-2 border border-bg-4 rounded text-xs font-mono text-text-primary placeholder:text-text-tertiary resize-none p-2 focus:outline-none focus:border-bg-5 min-h-[88px]"
        rows={4}
      />
    </div>
  );
}
