import type { FastifyInstance } from 'fastify';

// RF-1304, ADR-020: the host terminates TLS and forwards plain HTTP to the container, telling the
// app the client's scheme in `X-Forwarded-Proto`. Behind a trusted proxy (ROSETTA_TRUST_PROXY of 1
// or more) with an https public URL, a request the proxy marks as http is redirected to the same
// path on the public URL. The target is built from ROSETTA_PUBLIC_URL, never from the Host header,
// so the redirect cannot point elsewhere. A request without the header (the host's own health
// check reaching the container) is served as before.

export interface HttpsRedirectOptions {
  readonly publicUrl: string;
  readonly trustProxy: number;
}

const methodsKeptBy301 = new Set(['GET', 'HEAD']);

// RF-1304
export function registerHttpsRedirect(
  server: FastifyInstance,
  options: HttpsRedirectOptions,
): void {
  const publicUrl = new URL(options.publicUrl);
  if (options.trustProxy < 1 || publicUrl.protocol !== 'https:') return;
  server.addHook('onRequest', async (request, reply) => {
    if (request.headers['x-forwarded-proto'] === undefined || request.protocol !== 'http') return;
    // 308 keeps the method and body of a POST; 301 is the form every client follows for a GET.
    const status = methodsKeptBy301.has(request.method) ? 301 : 308;
    // Appended to the origin, never resolved against it: a path such as `//other.host/x` would
    // otherwise become a URL on another host.
    const path = request.url.startsWith('/') ? request.url : '/';
    await reply.redirect(`${publicUrl.origin}${path}`, status);
  });
}
