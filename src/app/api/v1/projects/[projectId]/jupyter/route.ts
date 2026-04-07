import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jupyterService } from '@/server/services/jupyter.service';
import { jobService } from '@/server/services/job.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const action = new URL(req.url).searchParams.get('action') ?? 'status';

  if (action === 'status') {
    const status = await jupyterService.getStatus(projectId);
    return NextResponse.json({ data: status });
  }
  if (action === 'events') {
    const events = await jupyterService.getEvents(projectId);
    return NextResponse.json({ data: events });
  }
  if (action === 'health') {
    const health = await jupyterService.agentHealth(projectId);
    return NextResponse.json({ data: health });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});

const ActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'watchdog']),
  watchdogAction: z.enum(['enable', 'disable', 'resume']).optional(),
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = ActionSchema.parse(await req.json());

  if (body.action === 'watchdog') {
    const result = await jupyterService.setWatchdog(projectId, body.watchdogAction ?? 'enable');
    return NextResponse.json({ data: result });
  }

  const { jobId, result } = await jobService.run(projectId, `jupyter_${body.action}`, `Jupyter ${body.action}`, async () => {
    switch (body.action) {
      case 'start':   return jupyterService.start(projectId);
      case 'stop':    return jupyterService.stop(projectId);
      case 'restart': return jupyterService.restart(projectId);
      default: throw new Error(`Unknown action: ${body.action}`);
    }
  });

  return NextResponse.json({ data: { jobId, result } });
});
