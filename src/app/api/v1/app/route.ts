import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { appSettings } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { apiHandler } from '@/lib/api-handler';

export const GET = apiHandler(async () => {
  const db = getDb();
  const rows = await db.select().from(appSettings);
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ data: settings });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const body = z.record(z.string(), z.string()).parse(await req.json());
  const db = getDb();
  for (const [key, value] of Object.entries(body)) {
    await db.insert(appSettings).values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date().toISOString() } });
  }
  return NextResponse.json({ data: { ok: true } });
});
