import { NextRequest, NextResponse } from 'next/server';
import { jobService } from '@/server/services/job.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const limit = parseInt(new URL(req.url).searchParams.get('limit') ?? '20');
  const jobs = await jobService.list(projectId, limit);
  return NextResponse.json({ data: jobs });
});
