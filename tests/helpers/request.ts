import { NextRequest } from 'next/server';

/**
 * Builds a NextRequest for passing directly to a route handler's exported
 * POST/GET, so tests exercise the real handler instead of a re-implemented
 * stand-in (see RA-18).
 */
export function buildJsonRequest(
  url: string,
  body: unknown,
  init: { headers?: Record<string, string>; method?: string } = {}
): NextRequest {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest(url, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: rawBody,
  });
}
