import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';

type Ctx = { params: Promise<{ owner: string; repo: string }> };

const ClearSchema = z.object({ confirmName: z.string() });

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const body = ClearSchema.parse(await req.json());
  if (body.confirmName !== repo) {
    return NextResponse.json({ error: 'Confirmation name does not match' }, { status: 400 });
  }
  const data = await github.clearRepo(owner, repo);
  return NextResponse.json({ data });
});
