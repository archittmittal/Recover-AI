import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';

// Reject oversized bodies before any parsing/hashing work happens (see
// RA-20). This is a first-line check on the declared Content-Length, not a
// substitute for a real streaming cap — a request omitting the header
// (e.g. chunked transfer-encoding) isn't caught here.
const MAX_BODY_BYTES = 64 * 1024;

export function proxy(req: NextRequest): NextResponse {
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 64KB limit' } },
      { status: 413 }
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const { allowed, retryAfterSeconds } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
