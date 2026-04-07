import { apiHandler } from '@/lib/api-handler';
import { journalService } from '@/server/services/journal.service';

export const PATCH = apiHandler(async (req, { params }) => {
  const { todoId } = await params;
  const { isDone } = await req.json();
  const data = await journalService.toggleTodo(todoId, isDone);
  return Response.json({ data });
});

export const DELETE = apiHandler(async (_req, { params }) => {
  const { todoId } = await params;
  await journalService.deleteTodo(todoId);
  return Response.json({ data: null });
});
