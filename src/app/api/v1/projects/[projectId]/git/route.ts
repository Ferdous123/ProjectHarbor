import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';
import { gitService } from '@/server/services/git.service';
import { jobService } from '@/server/services/job.service';
import { apiHandler } from '@/lib/api-handler';

type Ctx = { params: Promise<{ projectId: string }> };

const ActionSchema = z.object({
  action: z.enum(['status', 'pull', 'push', 'commit', 'log', 'branches', 'diff', 'checkout', 'init', 'checkpoint', 'checkpoints', 'restore']),
  message: z.string().optional(),
  branch: z.string().optional(),
  file: z.string().optional(),
  tag: z.string().optional(),
  files: z.array(z.string()).optional(),
});

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const project = await projectService.getProject(projectId);
  const action = new URL(req.url).searchParams.get('action') ?? 'status';

  if (action === 'status') {
    const status = await gitService.status(project.remoteDir);
    return NextResponse.json({ data: status });
  }
  if (action === 'log') {
    const log = await gitService.log(project.remoteDir);
    return NextResponse.json({ data: log });
  }
  if (action === 'branches') {
    const branches = await gitService.branches(project.remoteDir);
    return NextResponse.json({ data: branches });
  }
  if (action === 'diff') {
    const file = new URL(req.url).searchParams.get('file') ?? undefined;
    const diff = await gitService.diff(project.remoteDir, file);
    return NextResponse.json({ data: { diff } });
  }
  if (action === 'checkpoints') {
    const tags = await gitService.listTags(project.remoteDir);
    return NextResponse.json({ data: tags });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = ActionSchema.parse(await req.json());
  const project = await projectService.getProject(projectId);

  const { jobId, result } = await jobService.run(projectId, `git_${body.action}`, `git ${body.action}`, async () => {
    switch (body.action) {
      case 'pull':     return { output: await gitService.pull(project.remoteDir) };
      case 'push':     return { output: await gitService.push(project.remoteDir) };
      case 'commit':   return { output: await gitService.addAndCommit(project.remoteDir, body.message ?? 'Update') };
      case 'checkout': await gitService.checkout(project.remoteDir, body.branch!); return { ok: true };
      case 'init':     await gitService.init(project.remoteDir); return { ok: true };
      case 'checkpoint': {
        const label = body.message ?? 'checkpoint';
        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const tag = `checkpoint-${ts}`;
        const files = body.files ?? [];
        if (files.length > 0) await gitService.add(project.remoteDir, files);
        else await gitService.addAll(project.remoteDir);
        const output = await gitService.commit(project.remoteDir, `checkpoint: ${label}`);
        await gitService.createTag(project.remoteDir, tag);
        return { output, tag };
      }
      case 'restore': {
        const { tag, file } = body;
        if (!tag || !file) throw new Error('tag and file required');
        await gitService.checkoutFile(project.remoteDir, tag, file);
        return { ok: true };
      }
      default: throw new Error(`Unknown git action: ${body.action}`);
    }
  });

  return NextResponse.json({ data: { jobId, result } });
});
