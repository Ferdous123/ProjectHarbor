import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';

type Ctx = { params: Promise<{ owner: string; repo: string }> };

export const GET = apiHandler(async (_req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const data = await github.getRepo(owner, repo);
  return NextResponse.json({ data });
});

const UpdateSchema = z.object({
  description: z.string().optional(),
  private: z.boolean().optional(),
  name: z.string().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const body = UpdateSchema.parse(await req.json());
  const data = await github.updateRepo(owner, repo, body);
  return NextResponse.json({ data });
});

const DeleteSchema = z.object({ confirmName: z.string() });

export const DELETE = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo } = await ctx.params;
  const body = DeleteSchema.parse(await req.json());
  if (body.confirmName !== repo) {
    return NextResponse.json({ error: 'Confirmation name does not match' }, { status: 400 });
  }
  const data = await github.deleteRepo(owner, repo);
  return NextResponse.json({ data });
});
