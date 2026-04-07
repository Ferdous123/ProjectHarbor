import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const settings = await projectService.getSettings(projectId);
  // Never expose tokens/keys in response (mask them)
  const masked = { ...settings };
  if (masked['agent.apiKey']) masked['agent.apiKey'] = '***';
  if (masked['jupyter.token']) masked['jupyter.token'] = '***';
  if (masked['ssh.privateKeyPath']) masked['ssh.privateKeyPath'] = masked['ssh.privateKeyPath'];
  return NextResponse.json({ data: masked });
});

export const PUT = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = z.record(z.string(), z.string()).parse(await req.json());
  await projectService.setSettings(projectId, body);
  return NextResponse.json({ data: { ok: true } });
});
