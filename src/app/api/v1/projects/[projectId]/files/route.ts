import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import path from 'path';
import { projectService } from '@/server/services/project.service';
import { fileService } from '@/server/services/file.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const project = await projectService.getProject(projectId);
  const url = new URL(req.url);
  const relPath = url.searchParams.get('path') ?? '';
  const action = url.searchParams.get('action') ?? 'list';

  if (action === 'list') {
    const entries = await fileService.listDir(project.remoteDir, relPath);
    return NextResponse.json({ data: entries });
  }
  if (action === 'read') {
    const content = await fileService.readFile(project.remoteDir, relPath);
    return NextResponse.json({ data: { content } });
  }
  if (action === 'raw') {
    const buffer = await fileService.readFileBuffer(project.remoteDir, relPath);
    const ext = path.extname(relPath).slice(1).toLowerCase();
    const MIME: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
      bmp: 'image/bmp', pdf: 'application/pdf',
    };
    const contentType = MIME[ext] ?? 'application/octet-stream';
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=60' },
    });
  }
  if (action === 'search') {
    const q = url.searchParams.get('q') ?? '';
    const ext = url.searchParams.get('ext') ?? '';
    const results = await fileService.searchFiles(project.remoteDir, q, ext || undefined);
    return NextResponse.json({ data: results });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});

const WriteSchema = z.object({
  action: z.enum(['write', 'delete', 'mkdir', 'rename']),
  path: z.string(),
  content: z.string().optional(),
  newPath: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const project = await projectService.getProject(projectId);
  const body = WriteSchema.parse(await req.json());

  switch (body.action) {
    case 'write':
      await fileService.writeFile(project.remoteDir, body.path, body.content ?? '');
      return NextResponse.json({ data: { ok: true } });
    case 'delete':
      await fileService.deleteFile(project.remoteDir, body.path);
      return NextResponse.json({ data: { ok: true } });
    case 'mkdir':
      await fileService.createDir(project.remoteDir, body.path);
      return NextResponse.json({ data: { ok: true } });
    case 'rename':
      await fileService.rename(project.remoteDir, body.path, body.newPath!);
      return NextResponse.json({ data: { ok: true } });
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
});
