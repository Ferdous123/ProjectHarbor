import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectService } from '@/server/services/project.service';
import { apiHandler } from '@/lib/api-handler';

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.enum(['research', 'experiment', 'course', 'other']).optional(),
  tags: z.array(z.string()).optional(),
  remoteDir: z.string().default(''),
});

export const GET = apiHandler(async () => {
  const start = Date.now();
  const projects = await projectService.listProjects();
  return NextResponse.json({ data: projects, meta: { ms: Date.now() - start } });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const start = Date.now();
  const body = CreateSchema.parse(await req.json());
  const project = await projectService.createProject(body);
  return NextResponse.json({ data: project, meta: { ms: Date.now() - start } }, { status: 201 });
});
