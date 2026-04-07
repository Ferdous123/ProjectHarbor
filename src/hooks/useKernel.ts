'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { createJupyterMessage } from '@/lib/notebook-utils';
import { v4 as uuidv4 } from 'uuid';
import type { JupyterMessage, KernelRelayMessage, Cell } from '@/types';

type KernelStatus = 'idle' | 'busy' | 'starting' | 'dead' | 'reconnecting';

// Maps msg_id → cellId for routing outputs to the correct cell
type MsgCallback = {
  cellId: string;
  onComplete: () => void;
  silent?: false;
} | {
  cellId: '__silent__';
  onComplete: (stdout: string) => void;
  silent: true;
  stdout: string[];
};

export interface KernelCallbacks {
  onStatus: (status: KernelStatus) => void;
  onStream: (cellId: string, name: 'stdout' | 'stderr', text: string) => void;
  onExecuteResult: (cellId: string, data: any, executionCount: number) => void;
  onDisplayData: (cellId: string, data: any) => void;
  onError: (cellId: string, ename: string, evalue: string, traceback: string[]) => void;
  onExecuteInput: (cellId: string, executionCount: number) => void;
  onClearOutput: (cellId: string) => void;
  onCellComplete: (cellId: string) => void;
}

export function useKernel(projectId: string, notebookPath: string, callbacks: KernelCallbacks) {
  const [status, setStatus] = useState<KernelStatus>('starting');
  const [kernelId, setKernelId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef(uuidv4()); // fixed per connection
  const pendingMsgs = useRef(new Map<string, MsgCallback>());
  const attemptsRef = useRef(0);
  const executionQueue = useRef<string[]>([]);
  const executingRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (!notebookPath) return;
    const encodedPath = encodeURIComponent(notebookPath);
    const url = `ws://${window.location.host}/ws/kernel/${projectId}?notebook=${encodedPath}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('starting');

    ws.onopen = () => { attemptsRef.current = 0; };

    ws.onclose = (e) => {
      setIsConnected(false);
      if (e.code !== 1000) {
        setStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        setTimeout(connect, delay);
      } else {
        setStatus('dead');
      }
    };

    ws.onerror = () => {};

    ws.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data);

        // Control messages from our relay server
        if (raw.type === 'kernel_connected') {
          setKernelId(raw.kernelId);
          setIsConnected(true);
          setStatus('idle');
          return;
        }
        if (raw.type === 'kernel_disconnected') {
          setIsConnected(false);
          setStatus('dead');
          return;
        }
        if (raw.type === 'kernel_reconnecting') {
          setIsConnected(false);
          setStatus('reconnecting');
          return;
        }
        if (raw.type === 'kernel_error') {
          toast.error(`Kernel error: ${raw.error}`);
          setStatus('dead');
          return;
        }

        // Jupyter wire protocol messages
        const msg = raw as JupyterMessage;
        const msgId = msg.parent_header && (msg.parent_header as any).msg_id;
        const pending = msgId ? pendingMsgs.current.get(msgId) : null;
        const cellId = pending?.cellId ?? '';

        if (msg.channel === 'iopub') {
          switch (msg.header.msg_type) {
            case 'status':
              callbacks.onStatus(msg.content.execution_state as KernelStatus);
              setStatus(msg.content.execution_state as KernelStatus);
              break;
            case 'stream':
              if (pending?.silent && msg.content.name === 'stdout') {
                pending.stdout.push(msg.content.text);
              } else if (cellId) {
                callbacks.onStream(cellId, msg.content.name, msg.content.text);
              }
              break;
            case 'execute_result':
              if (cellId && !pending?.silent) callbacks.onExecuteResult(cellId, msg.content.data, msg.content.execution_count);
              break;
            case 'display_data':
              if (cellId && !pending?.silent) callbacks.onDisplayData(cellId, msg.content.data);
              break;
            case 'update_display_data':
              if (cellId && !pending?.silent) callbacks.onDisplayData(cellId, msg.content.data);
              break;
            case 'error':
              if (cellId && !pending?.silent) callbacks.onError(cellId, msg.content.ename, msg.content.evalue, msg.content.traceback);
              break;
            case 'execute_input':
              if (cellId && !pending?.silent) callbacks.onExecuteInput(cellId, msg.content.execution_count);
              break;
            case 'clear_output':
              if (cellId && !pending?.silent) callbacks.onClearOutput(cellId);
              break;
          }
        } else if (msg.channel === 'shell') {
          if (msg.header.msg_type === 'execute_reply' && msgId && pending) {
            if (pending.silent) {
              const stdout = pending.stdout.join('');
              pending.onComplete(stdout);
            } else {
              (pending.onComplete as () => void)();
              callbacks.onCellComplete(pending.cellId);
            }
            pendingMsgs.current.delete(msgId);
          }
        }
      } catch { /* ignore parse errors */ }
    };
  }, [projectId, notebookPath, callbacks]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(1000); };
  }, [connect]);

  // ── Execute a cell ──
  const execute = useCallback((code: string, cellId: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error('Kernel not connected');
        resolve();
        return;
      }

      const msg = createJupyterMessage('execute_request', {
        code,
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true,
      }, sessionIdRef.current, 'shell');

      pendingMsgs.current.set(msg.header.msg_id, { cellId, onComplete: resolve });
      wsRef.current.send(JSON.stringify(msg));
    });
  }, []);

  // ── Silent execute (for variable inspector) ──
  const executeSilent = useCallback((code: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }
      const msg = createJupyterMessage('execute_request', {
        code,
        silent: true,
        store_history: false,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: false,
      }, sessionIdRef.current, 'shell');

      pendingMsgs.current.set(msg.header.msg_id, {
        cellId: '__silent__',
        silent: true,
        stdout: [],
        onComplete: (stdout: string) => resolve(stdout || null),
      });
      wsRef.current.send(JSON.stringify(msg));
      // Timeout after 10s
      setTimeout(() => {
        if (pendingMsgs.current.has(msg.header.msg_id)) {
          pendingMsgs.current.delete(msg.header.msg_id);
          resolve(null);
        }
      }, 10000);
    });
  }, []);

  // ── Interrupt (REST, not WS — E2) ──
  const interrupt = useCallback(async () => {
    if (!kernelId) return;
    executionQueue.current = [];
    executingRef.current = null;
    await fetch(`/api/v1/proxy/jupyter/api/kernels/${kernelId}/interrupt?projectId=${projectId}`, {
      method: 'POST',
    });
  }, [kernelId, projectId]);

  // ── Restart (REST, not WS — E2) ──
  const restart = useCallback(async () => {
    if (!kernelId) return;
    executionQueue.current = [];
    executingRef.current = null;
    pendingMsgs.current.clear();
    await fetch(`/api/v1/proxy/jupyter/api/kernels/${kernelId}/restart?projectId=${projectId}`, {
      method: 'POST',
    });
    setStatus('starting');
    // Reconnect WS after restart
    wsRef.current?.close(1000);
    setTimeout(connect, 1000);
  }, [kernelId, projectId, connect]);

  return { status, kernelId, isConnected, execute, executeSilent, interrupt, restart, sessionId: sessionIdRef.current };
}
