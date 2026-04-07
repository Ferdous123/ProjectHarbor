import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scheduleService } from '@/server/services/schedule.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

const CreateSchema = z.object({
  name: z.string().min(1),
  taskType: z.string(),
  cronExpression: z.string().optional(),
  intervalMinutes: z.number().optional(),
  config: z.record(z.string(), z.any()).optional(),
  enabled: z.boolean().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  return NextResponse.json({ data: await scheduleService.list(projectId) });
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = CreateSchema.parse(await req.json());
  const schedule = await scheduleService.create({ projectId, ...body });
  return NextResponse.json({ data: schedule }, { status: 201 });
});
