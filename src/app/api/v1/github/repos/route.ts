import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import * as github from '@/server/services/github.service';
import { sanitizeGitHubRepoName } from '@/lib/utils';

export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10);
  const repos = await github.listRepos(page, perPage);
  return NextResponse.json({ data: repos });
});

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  isPrivate: z.boolean().default(true),
  projectDir: z.string().optional(),
  initAndPush: z.boolean().default(false),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = CreateSchema.parse(await req.json());
  const safeName = sanitizeGitHubRepoName(body.name);

  if (body.initAndPush && body.projectDir) {
    const result = await github.createAndInitRepo({
      name: safeName,
      description: body.description,
      isPrivate: body.isPrivate,
      projectDir: body.projectDir,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  }

  const repo = await github.createRepo(safeName, body.description, body.isPrivate);
  return NextResponse.json({ data: repo }, { status: 201 });
});
