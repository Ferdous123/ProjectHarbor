import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/server/services/notification.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const unreadOnly = new URL(req.url).searchParams.get('unread') === 'true';
  return NextResponse.json({ data: await notificationService.list(projectId, unreadOnly) });
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  if (body.action === 'mark_all_read') {
    await notificationService.markAllRead(projectId);
    return NextResponse.json({ data: { ok: true } });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
