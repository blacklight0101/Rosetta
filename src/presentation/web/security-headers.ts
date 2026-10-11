import type { FastifyHelmetOptions } from '@fastify/helmet';

// RF-1013: the content security policy, nosniff and no-referrer on every response; HSTS only when
// the application is served over https (ROSETTA_PUBLIC_URL). RF-1201: never indexed.

const oneYearInSeconds = 31_536_000;

/** RF-1201: the value of `X-Robots-Tag` on every response. */
export const robotsTag = 'noindex, nofollow';

/** RF-1201: robots.txt disallows everything. */
export const robotsTxt = 'User-agent: *\nDisallow: /\n';

// RF-1013
export function securityHeaderOptions(publicUrl: string): FastifyHelmetOptions {
  const https = new URL(publicUrl).protocol === 'https:';
  return {
    global: true,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: https
      ? { maxAge: oneYearInSeconds, includeSubDomains: false, preload: false }
      : false,
  };
}
