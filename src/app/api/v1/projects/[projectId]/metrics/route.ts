import { NextRequest, NextResponse } from 'next/server';
import { metricsService } from '@/server/services/metrics.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const hours = parseInt(url.searchParams.get('hours') ?? '1');
  const source = url.searchParams.get('source') ?? 'db'; // 'db' | 'agent'

  if (source === 'agent') {
    const data = await metricsService.fetchFromAgent(projectId, hours);
    return NextResponse.json({ data });
  }

  const data = await metricsService.getHistory(projectId, hours);
  return NextResponse.json({ data });
});
