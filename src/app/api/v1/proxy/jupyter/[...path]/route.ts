/**
 * Jupyter proxy — forwards all requests to the local Jupyter server.
 * Adds Authorization: token header.
 * Exports all HTTP methods (E2: interrupt/restart are PUT/POST).
 */
import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/server/services/project.service';

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? '';

  let jupyterHost = '127.0.0.1';
  let jupyterPort = '8888';
  let jupyterToken = '';

  if (projectId) {
    try {
      const settings = await projectService.getSettings(projectId);
      jupyterPort = settings['jupyter.port'] || jupyterPort;
      jupyterToken = settings['jupyter.token'] || jupyterToken;
      // Jupyter always runs on localhost (architecture: everything on PC)
    } catch { /* use defaults */ }
  }

  const jupyterPath = path.join('/');
  const query = url.searchParams.toString()
    .replace(/projectId=[^&]*&?/, '')
    .replace(/&$/, '');

  const targetUrl = `http://${jupyterHost}:${jupyterPort}/${jupyterPath}${query ? `?${query}` : ''}`;

  try {
    const contentType = req.headers.get('Content-Type') ?? 'application/json';
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': contentType,
        'Authorization': jupyterToken ? `token ${jupyterToken}` : '',
      },
      body,
      signal: AbortSignal.timeout(30000),
    });

    const responseBody = await resp.arrayBuffer();
    return new NextResponse(responseBody, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Jupyter unreachable' }, { status: 504 });
  }
}

// Must export all methods — Jupyter uses PUT for save, POST for kernel ops (E2)
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
