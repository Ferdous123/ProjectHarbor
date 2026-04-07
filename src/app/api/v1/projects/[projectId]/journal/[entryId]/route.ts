import { apiHandler } from '@/lib/api-handler';
import { journalService } from '@/server/services/journal.service';

export const PATCH = apiHandler(async (req, { params }) => {
  const { entryId } = await params;
  const body = await req.json();
  const data = await journalService.updateEntry(entryId, body);
  return Response.json({ data });
});

export const DELETE = apiHandler(async (_req, { params }) => {
  const { entryId } = await params;
  await journalService.deleteEntry(entryId);
  return Response.json({ data: null });
});
