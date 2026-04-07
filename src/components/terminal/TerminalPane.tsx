'use client';
import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface Props {
  projectId: string;
  tabIndex?: number;
}

export default function TerminalPane({ projectId, tabIndex = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback((term: XTerm) => {
    const url = `ws://${window.location.host}/ws/terminal/${projectId}/${tabIndex}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      term.write('\r\n\x1b[32m[Connected]\x1b[0m\r\n');
      // Send initial resize
      const fit = fitRef.current;
      if (fit) {
        fit.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    ws.onmessage = (e) => {
      term.write(e.data);
    };

    ws.onclose = (e) => {
      if (e.code !== 1000) {
        term.write('\r\n\x1b[33m[Disconnected — reconnecting...]\x1b[0m\r\n');
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 30000);
        attemptsRef.current++;
        setTimeout(() => connect(term), delay);
      } else {
        term.write('\r\n\x1b[31m[Terminal closed]\x1b[0m\r\n');
      }
    };

    ws.onerror = () => {};
  }, [projectId, tabIndex]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#3e3d32', red: '#f85149', green: '#3fb950', yellow: '#d29922',
        blue: '#388bfd', magenta: '#bc8cff', cyan: '#76e4f7', white: '#e6edf3',
        brightBlack: '#636e7b', brightRed: '#ff7b72', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#a5d6ff', brightWhite: '#f0f0f5',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    fitRef.current = fitAddon;
    termRef.current = term;

    // Input → WebSocket
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    connect(term);

    return () => {
      ro.disconnect();
      wsRef.current?.close(1000);
      term.dispose();
    };
  }, [connect]);

  return <div ref={containerRef} className="flex-1 h-full min-h-0" style={{ padding: '4px' }} />;
}
