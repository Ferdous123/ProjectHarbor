import { NextRequest, NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';

type Ctx = { params: Promise<{ owner: string; repo: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const data = await github.listBranches(owner, repo);
  return NextResponse.json({ data });
});
