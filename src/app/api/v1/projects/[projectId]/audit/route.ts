import { NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

    const db = getDb();
    const events = db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId))
      .orderBy(desc(auditEvents.id))
      .limit(limit)
      .all();

    return NextResponse.json({ data: events });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
