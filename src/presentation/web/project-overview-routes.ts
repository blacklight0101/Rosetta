import type { FastifyInstance } from 'fastify';
import type {
  ListProjectOverview,
  ProjectOverview,
} from '../../application/use-cases/list-project-overview.js';
import { totalsView } from './cost-routes.js';
import { projectView } from './project-routes.js';
import { signedInOf } from './request-actor.js';
import { runView } from './run-view.js';

// RF-1008, RF-1108, RF-1010, RF-1105: GET /api/projects/overview gives the Projects page the
// signed-in user's projects, newest first, each with `runs` (how many it has), `totals` (summed
// from the cost ledger; amounts as decimal strings of micro-units) and `lastRun` (null without
// one) with its `position` in the queue while it is queued (null otherwise). A queued run is
// cancelled with POST /api/runs/:runId/stop (run-routes.ts). The owner's id and the snapshot folder
// never leave the server. The static path wins over `/api/projects/:id`, and no project id is
// `overview` (ids are UUIDs).

export interface ProjectOverviewServices {
  readonly listProjectOverview: ListProjectOverview;
}

function overviewRow(row: ProjectOverview): Record<string, unknown> {
  const { project, runs, totals, lastRun, position } = row;
  return {
    project: projectView(project),
    runs,
    totals: totalsView(totals),
    lastRun: lastRun === undefined ? null : { ...runView(lastRun), position: position ?? null },
  };
}

// RF-1008, RF-1108
export function registerProjectOverviewRoutes(
  server: FastifyInstance,
  services: ProjectOverviewServices,
): void {
  server.get('/api/projects/overview', { config: { access: 'user' } }, async (request, reply) => {
    const page = await services.listProjectOverview.execute({ actor: signedInOf(request).actor });
    return reply
      .status(200)
      .send({ projects: page.rows.map(overviewRow), truncated: page.truncated });
  });
}
