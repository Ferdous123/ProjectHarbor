import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';

type Ctx = { params: Promise<{ owner: string; repo: string; filePath?: string[] }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo, filePath } = await ctx.params;
  const url = new URL(req.url);
  const ref = url.searchParams.get('ref') || 'main';
  const joinedPath = filePath ? filePath.join('/') : '';
  const data = await github.getRepoContents(owner, repo, joinedPath, ref);
  return NextResponse.json({ data });
});

const UploadSchema = z.object({
  content: z.string(),
  message: z.string(),
  sha: z.string().optional(),
});

export const PUT = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo, filePath } = await ctx.params;
  const joinedPath = filePath ? filePath.join('/') : '';
  const body = UploadSchema.parse(await req.json());
  const data = await github.uploadFile(owner, repo, joinedPath, body.content, body.message, body.sha);
  return NextResponse.json({ data });
});

const DeleteSchema = z.object({ sha: z.string(), message: z.string() });

export const DELETE = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { owner, repo, filePath } = await ctx.params;
  const joinedPath = filePath ? filePath.join('/') : '';
  const body = DeleteSchema.parse(await req.json());
  const data = await github.deleteFile(owner, repo, joinedPath, body.sha, body.message);
  return NextResponse.json({ data });
});
