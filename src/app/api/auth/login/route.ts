import { NextRequest, NextResponse } from 'next/server';
import { timingSafeStringEqual } from '@/lib/auth/crypto';
import {
  createSessionToken,
  isSessionConfigured,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/session';
import { isTemplatePlaceholder } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const configuredUsername = process.env.DASHBOARD_USERNAME || '';
    const configuredPassword = process.env.DASHBOARD_PASSWORD || '';

    // A `.env` copied from `.env.example` leaves all three as their template values. Answering
    // 401 there is misleading — nothing the operator types can succeed — and issuing a session
    // signed with the repository's own placeholder secret would be worse than refusing.
    if (
      isTemplatePlaceholder(configuredUsername) ||
      isTemplatePlaceholder(configuredPassword) ||
      !isSessionConfigured()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message:
              'Dashboard login is not configured. Set SESSION_SECRET, DASHBOARD_USERNAME and ' +
              'DASHBOARD_PASSWORD to real values (see .env.example).',
          },
        },
        { status: 503 }
      );
    }

    const usernameMatches = username.length > 0 && timingSafeStringEqual(username, configuredUsername);
    const passwordMatches = password.length > 0 && timingSafeStringEqual(password, configuredPassword);

    if (!usernameMatches || !passwordMatches) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } },
        { status: 401 }
      );
    }

    const token = createSessionToken(configuredUsername);
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_CONFIGURED', message: 'Dashboard login is not configured' } },
        { status: 503 }
      );
    }

    const res = NextResponse.json({ success: true, data: { message: 'Logged in' } });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error: unknown) {
    console.error('[POST /api/auth/login]', error);
    return NextResponse.json(
      { success: false, error: { code: 'LOGIN_ERROR', message: 'Login failed' } },
      { status: 500 }
    );
  }
}
