import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/server/services/project.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const settings = await projectService.getSettings(projectId);
  const agentHost = settings['agent.host'] || '127.0.0.1';
  const agentPort = settings['agent.port'] || '9111';
  const apiKey = settings['agent.apiKey'] || '';

  try {
    const resp = await fetch(`http://${agentHost}:${agentPort}/processes`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    return NextResponse.json({ data: await resp.json() });
  } catch {
    return NextResponse.json({ data: [], error: 'Agent unreachable' });
  }
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const settings = await projectService.getSettings(projectId);
  const agentHost = settings['agent.host'] || '127.0.0.1';
  const agentPort = settings['agent.port'] || '9111';
  const apiKey = settings['agent.apiKey'] || '';

  const resp = await fetch(`http://${agentHost}:${agentPort}/processes/kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ pid: body.pid }),
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
  return NextResponse.json({ data: { ok: true } });
});
