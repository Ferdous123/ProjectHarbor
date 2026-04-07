import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';
import { apiHandler } from '@/lib/api-handler';

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  isPinned: z.boolean().optional(),
  remoteDir: z.string().optional(),
});

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const project = await projectService.getProject(projectId);
  return NextResponse.json({ data: project });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = UpdateSchema.parse(await req.json());
  const project = await projectService.updateProject(projectId, body);
  return NextResponse.json({ data: project });
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  await projectService.deleteProject(projectId);
  return NextResponse.json({ data: { ok: true } });
});
