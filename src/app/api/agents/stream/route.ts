import { NextRequest } from 'next/server';
import { createSSEStream, SSEManager } from '@/lib/sse';
import { verifyAccessToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') 
    || request.cookies.get('genova_session')?.value;
  
  if (!token) {
    return new Response('Non authentifié', { status: 401 });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return new Response('Token invalide', { status: 401 });
  }

  const stream = createSSEStream(payload.userId);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
