import type { FastifyInstance } from 'fastify';
import { renderLandingPage, type LandingOptions } from './landing-page.js';

/** Where a signed-in visitor goes instead of the landing page (RF-1200). */
const PROJECTS_PAGE = '/projects';

/**
 * RF-1200, RF-1201: `GET /` is the public landing page, written by the server so it needs no
 * JavaScript. A visitor with a session is sent to their projects; everyone else sees the page, with
 * "Request access" only when a contact address is configured (Q-20). `HEAD /` follows `GET /`.
 */
// RF-1200
export function registerLandingRoute(server: FastifyInstance, options: LandingOptions): void {
  const page = renderLandingPage(options);
  server.get('/', { config: { access: 'public' } }, (request, reply) => {
    if (request.signedIn !== null) return reply.redirect(PROJECTS_PAGE, 302);
    return reply
      .status(200)
      .header('Cache-Control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(page);
  });
}
