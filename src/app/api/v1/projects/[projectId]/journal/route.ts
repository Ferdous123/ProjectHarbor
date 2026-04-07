import { apiHandler } from '@/lib/api-handler';
import { journalService } from '@/server/services/journal.service';

export const GET = apiHandler(async (_req, { params }) => {
  const { projectId } = await params;
  const data = await journalService.listEntries(projectId);
  return Response.json({ data });
});

export const POST = apiHandler(async (req, { params }) => {
  const { projectId } = await params;
  const { content, isPinned } = await req.json();
  if (!content?.trim()) {
    return Response.json({ error: 'content required' }, { status: 400 });
  }
  const data = await journalService.createEntry(projectId, content, isPinned);
  return Response.json({ data }, { status: 201 });
});
