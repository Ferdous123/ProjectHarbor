import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';
import { environmentService } from '@/server/services/environment.service';
import { jobService } from '@/server/services/job.service';
import { apiHandler } from '@/lib/api-handler';
import path from 'path';

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const project = await projectService.getProject(projectId);
  const action = new URL(req.url).searchParams.get('action') ?? 'packages';
  const settings = await projectService.getSettings(projectId);
  const envPath = settings['python.envPath'] ?? '';

  if (action === 'packages' && envPath) {
    const packages = await environmentService.listPackages(envPath);
    return NextResponse.json({ data: packages });
  }
  if (action === 'envs') {
    const searchPaths = [path.dirname(project.remoteDir)];
    const envs = await environmentService.listEnvs(searchPaths);
    return NextResponse.json({ data: envs });
  }
  return NextResponse.json({ data: [] });
});

const PkgSchema = z.object({
  action: z.enum(['install', 'uninstall']),
  package: z.string().min(1),
});

export const POST = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const { projectId } = await ctx.params;
  const body = PkgSchema.parse(await req.json());
  const settings = await projectService.getSettings(projectId);
  const envPath = settings['python.envPath'] ?? '';
  if (!envPath) throw new Error('Python environment not configured');

  const { jobId, result } = await jobService.run(
    projectId, `env_${body.action}`, `pip ${body.action} ${body.package}`, async () => {
      if (body.action === 'install') return { output: await environmentService.installPackage(envPath, body.package) };
      return { output: await environmentService.uninstallPackage(envPath, body.package) };
    }
  );
  return NextResponse.json({ data: { jobId, result } });
});
