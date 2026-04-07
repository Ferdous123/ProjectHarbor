'use client';
import { useEffect, useState } from 'react';
import SessionLock from './SessionLock';

export default function SessionLockWrapper() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(0);
  const [passphrase, setPassphrase] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch('/api/v1/app')
      .then((r) => r.json())
      .then((d) => {
        const mins = parseInt(d.data?.lock_timeout_minutes ?? '0');
        setTimeoutMinutes(isNaN(mins) ? 0 : mins);
        const pp = d.data?.lock_passphrase;
        setPassphrase(pp && pp.length > 0 ? pp : undefined);
      })
      .catch(() => {});
  }, []);

  if (timeoutMinutes === 0) return null;

  return <SessionLock timeoutMinutes={timeoutMinutes} passphrase={passphrase} />;
}
