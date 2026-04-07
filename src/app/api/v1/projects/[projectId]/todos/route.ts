import { apiHandler } from '@/lib/api-handler';
import { journalService } from '@/server/services/journal.service';

export const GET = apiHandler(async (_req, { params }) => {
  const { projectId } = await params;
  const data = await journalService.listTodos(projectId);
  return Response.json({ data });
});

export const POST = apiHandler(async (req, { params }) => {
  const { projectId } = await params;
  const { text, dueAt } = await req.json();
  if (!text?.trim()) {
    return Response.json({ error: 'text required' }, { status: 400 });
  }
  const data = await journalService.createTodo(projectId, text, dueAt);
  return Response.json({ data }, { status: 201 });
});
