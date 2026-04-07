/**
 * Terminal WebSocket handler — uses node-pty for local shell (NOT SSH).
 * Architecture: everything runs ON the PC.
 */
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import * as pty from 'node-pty';
import { projectService } from '@/server/services/project.service';

// Track active pty processes
const activePtys = new Map<WebSocket, pty.IPty>();

export async function handleTerminalWs(
  ws: WebSocket,
  _req: IncomingMessage,
  projectId: string,
  _tab: string
): Promise<void> {
  let shell: pty.IPty | null = null;

  try {
    const project = await projectService.getProject(projectId);
    const cwd = project.remoteDir || process.cwd();

    // Use PowerShell on Windows, bash elsewhere
    const shellExe = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? [] : [];

    shell = pty.spawn(shellExe, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    } as any);

    activePtys.set(ws, shell);

    // PTY → WebSocket
    shell.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    shell.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[Process exited with code ${exitCode}]\r\n`);
        ws.close(1000);
      }
      activePtys.delete(ws);
    });

    // WebSocket → PTY
    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'resize') {
          shell?.resize(msg.cols ?? 80, msg.rows ?? 24);
        } else if (msg.type === 'data') {
          shell?.write(msg.data);
        }
      } catch {
        // Raw data (not JSON) — write directly
        shell?.write(data.toString());
      }
    });

    ws.on('close', () => {
      shell?.kill();
      activePtys.delete(ws);
    });

    ws.on('error', () => {
      shell?.kill();
      activePtys.delete(ws);
    });

  } catch (err: any) {
    console.error('[terminal] Error:', err.message);
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Terminal error: ${err.message}]\r\n`);
      ws.close(1011, err.message);
    }
    shell?.kill();
    activePtys.delete(ws);
  }
}
