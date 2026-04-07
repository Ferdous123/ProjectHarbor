'use client';
import { useEffect, useState, useCallback, useRef } from 'react';

interface Props {
  timeoutMinutes: number; // 0 = disabled
  passphrase?: string;
}

export default function SessionLock({ timeoutMinutes, passphrase }: Props) {
  const [locked, setLocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [now, setNow] = useState(new Date());
  const lastActivityRef = useRef(Date.now());

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (locked) setLocked(false);
  }, [locked]);

  // Track activity events
  useEffect(() => {
    if (timeoutMinutes === 0) return;
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, resetActivity));
  }, [timeoutMinutes, resetActivity]);

  // Check timeout every 60s
  useEffect(() => {
    if (timeoutMinutes === 0) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 60000;
      if (elapsed >= timeoutMinutes) setLocked(true);
    }, 60000);
    return () => clearInterval(id);
  }, [timeoutMinutes]);

  // Clock update
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const unlock = useCallback(() => {
    if (passphrase) {
      if (input === passphrase) {
        setLocked(false);
        setInput('');
        setError(false);
        lastActivityRef.current = Date.now();
      } else {
        setError(true);
        setTimeout(() => setError(false), 1500);
      }
    } else {
      setLocked(false);
      lastActivityRef.current = Date.now();
    }
  }, [input, passphrase]);

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-bg-0/95 backdrop-blur-sm flex flex-col items-center justify-center">
      <div className="text-center space-y-6">
        <div className="text-5xl font-mono font-bold text-text-primary tabular-nums">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-sm text-text-secondary">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="text-xs text-text-tertiary font-medium tracking-widest uppercase">
          ProjectHarbor — Locked
        </div>

        {passphrase ? (
          <div className="space-y-3">
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
              placeholder="Enter passphrase"
              autoFocus
              className={`bg-bg-2 border rounded px-4 py-2 text-sm font-mono text-text-primary text-center focus:outline-none transition-colors ${
                error ? 'border-accent-red' : 'border-bg-4 focus:border-bg-5'
              }`}
            />
            {error && <p className="text-xs text-accent-red">Incorrect passphrase</p>}
          </div>
        ) : null}

        <button
          onClick={unlock}
          className="px-6 py-2 text-sm font-medium rounded bg-bg-3 hover:bg-bg-4 text-text-primary transition-colors border border-bg-4"
        >
          {passphrase ? 'Unlock' : 'Click to Unlock'}
        </button>
      </div>
    </div>
  );
}
