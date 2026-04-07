import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/server/services/notification.service';
import { apiHandler } from '@/lib/api-handler';

export const GET = apiHandler(async (req: NextRequest) => {
  const unreadOnly = new URL(req.url).searchParams.get('unread') === 'true';
  return NextResponse.json({ data: await notificationService.list(undefined, unreadOnly) });
});
