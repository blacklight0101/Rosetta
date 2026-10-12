import type { CookieSerializeOptions } from '@fastify/cookie';

// RF-1013, RF-1101, ADR-015: the session cookie and the CSRF secret cookie. The `__Host-` prefix
// makes the browser refuse them unless they are Secure, have Path=/ and no Domain; HttpOnly keeps
// them from scripts and SameSite=Strict from other sites. No Max-Age: the cookie ends with the
// browser, and the server ends the session after 8 idle hours or 7 days.

export const SESSION_COOKIE = '__Host-rosetta_session';
export const CSRF_COOKIE = '__Host-rosetta_csrf';
/** The request header that carries the CSRF token (RF-1009). */
export const CSRF_HEADER = 'x-csrf-token';

export const secureCookie: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};
