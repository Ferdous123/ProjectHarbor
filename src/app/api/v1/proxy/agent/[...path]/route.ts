/**
 * Agent proxy — forwards all requests to PC agent REST API.
 * Reads project settings for host/port/apiKey.
 * Adds X-API-Key header (E6).
 */
import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/server/services/project.service';

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? '';

  let agentHost = '127.0.0.1';
  let agentPort = '9111';
  let apiKey = '';

  if (projectId) {
    try {
      const settings = await projectService.getSettings(projectId);
      agentHost = settings['agent.host'] || agentHost;
      agentPort = settings['agent.port'] || agentPort;
      apiKey = settings['agent.apiKey'] || apiKey;
    } catch { /* project not found, use defaults */ }
  }

  const agentPath = path.join('/');
  const query = url.searchParams.toString()
    .replace(/projectId=[^&]*&?/, '')
    .replace(/&$/, '');

  const targetUrl = `http://${agentHost}:${agentPort}/${agentPath}${query ? `?${query}` : ''}`;

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const responseBody = await resp.text();
    return new NextResponse(responseBody, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 504 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
