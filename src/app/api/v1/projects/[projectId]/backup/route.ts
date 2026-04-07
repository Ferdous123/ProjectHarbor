import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/server/services/project.service';
import { gitBackupWithProgress } from '@/server/services/backup.service';
import { getDb } from '@/server/db/client';
import { backupHistory } from '@/server/db/schema';
import { eq, desc } from 'drizzle-orm';

type Ctx = { params: Promise<{ projectId: string }> };

// GET: backup history
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '20'), 100);
    const db = getDb();
    const rows = db
      .select()
      .from(backupHistory)
      .where(eq(backupHistory.projectId, projectId))
      .orderBy(desc(backupHistory.createdAt))
      .limit(limit)
      .all();
    return NextResponse.json({ data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: trigger git backup, stream progress via SSE
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { projectId } = await params;
    const project = await projectService.getProject(projectId);
    const dir = project.remoteDir;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        try {
          const result = await gitBackupWithProgress(projectId, dir, (step) => send(step));
          send({ done: true, ...result });
        } catch (err: any) {
          send({ error: err.message });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
