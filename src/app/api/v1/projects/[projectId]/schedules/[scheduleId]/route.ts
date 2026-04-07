import { apiHandler } from '@/lib/api-handler';
import { scheduleService } from '@/server/services/schedule.service';

export const DELETE = apiHandler(async (_req, { params }) => {
  const { projectId, scheduleId } = await params;
  scheduleService.delete(scheduleId);
  return Response.json({ data: null });
});

export const PATCH = apiHandler(async (req, { params }) => {
  const { projectId, scheduleId } = await params;
  const body = await req.json();
  scheduleService.update(scheduleId, body);
  return Response.json({ data: null });
});
