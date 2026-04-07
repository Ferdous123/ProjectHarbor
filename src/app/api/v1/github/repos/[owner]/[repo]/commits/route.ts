import { NextRequest, NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';

type Ctx = { params: Promise<{ owner: string; repo: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('per_page') || '20', 10);
  const data = await github.listCommits(owner, repo, page, perPage);
  return NextResponse.json({ data });
});
