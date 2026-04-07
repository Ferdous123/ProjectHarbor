import { NextRequest, NextResponse } from 'next/server';

/**
 * Wraps a Next.js route handler with standard error handling and timing.
 */
export function apiHandler(
  fn: (req: NextRequest, ctx?: any) => Promise<NextResponse | Response>
) {
  return async (req: NextRequest, ctx?: any): Promise<NextResponse> => {
    const start = Date.now();
    try {
      return await fn(req, ctx) as NextResponse;
    } catch (e: any) {
      const status =
        e.status === 403 ? 403 :
        e.code === 'NOT_FOUND' ? 404 :
        e.status || 500;
      console.error(`API error [${req.method} ${req.url}]:`, e.message);
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status, headers: { 'X-Duration-Ms': String(Date.now() - start) } }
      );
    }
  };
}
