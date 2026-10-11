import type { FastifyHelmetOptions } from '@fastify/helmet';

// RF-1013: the content security policy, nosniff and no-referrer on every response; HSTS only when
// the application is served over https (ROSETTA_PUBLIC_URL). RF-1201: never indexed.

const oneYearInSeconds = 31_536_000;

/** RF-1201: the value of `X-Robots-Tag` on every response. */
export const robotsTag = 'noindex, nofollow';

/** RF-1201: robots.txt disallows everything. */
export const robotsTxt = 'User-agent: *\nDisallow: /\n';

/** The directives of RF-1013, in its order. */
const cspDirectives = {
  defaultSrc: ["'self'"],
  connectSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  styleSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
} as const;

function isHttps(publicUrl: string): boolean {
  return new URL(publicUrl).protocol === 'https:';
}

// RF-1013
export function securityHeaderOptions(publicUrl: string): FastifyHelmetOptions {
  return {
    global: true,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: Object.fromEntries(
        Object.entries(cspDirectives).map(([name, sources]) => [name, [...sources]]),
      ),
    },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' },
    // Agrees with `frame-ancestors 'none'` for browsers that ignore the CSP directive.
    xFrameOptions: { action: 'deny' },
    strictTransportSecurity: isHttps(publicUrl)
      ? { maxAge: oneYearInSeconds, includeSubDomains: false, preload: false }
      : false,
  };
}

/** `defaultSrc` -> `default-src`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * RF-1013, RF-1201: the same headers written by hand, for the responses sent before helmet's hook
 * runs (framework errors and refused connections).
 */
export function fallbackSecurityHeaders(publicUrl: string): Readonly<Record<string, string>> {
  const policy = Object.entries(cspDirectives)
    .map(([name, sources]) => `${kebab(name)} ${sources.join(' ')}`)
    .join('; ');
  return {
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    ...(isHttps(publicUrl)
      ? { 'Strict-Transport-Security': `max-age=${String(oneYearInSeconds)}` }
      : {}),
    'X-Robots-Tag': robotsTag,
  };
}
