import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009: the access matrix rows of the routes Plan setup adds (RF-605, RF-606, RF-608):
// the catalogue every signed-in user reads and the options of a project, which only its owner asks
// for. The planning brief and the plan estimate are in the projects area (access-matrix-rows.ts).

const projectUrl = (suffix: string) => (context: Context) =>
  `/api/projects/${context.projectId}${suffix}`;

export const planRows: Readonly<Record<string, readonly Probe[]>> = {
  // RF-606: the catalogue is the same for everyone who is signed in.
  'GET /api/plan/catalogue': [
    { method: 'GET', url: () => '/api/plan/catalogue', expected: active(401, 200) },
  ],
  'HEAD /api/plan/catalogue': [
    { method: 'HEAD', url: () => '/api/plan/catalogue', expected: active(401, 200) },
  ],
  // RF-614: the matrix project has no understand run, so the owner's answer is RST-1802 (409); a
  // run id of no run is not found (404) whoever asks.
  'GET /api/projects/:id/plan-source': [
    { method: 'GET', url: projectUrl('/plan-source'), expected: ownerOnly(409) },
    {
      method: 'GET',
      url: projectUrl('/plan-source?run=00000000-0000-4000-b000-000000000000'),
      expected: ownerOnly(404),
    },
    {
      method: 'GET',
      url: () => '/api/projects/not-a-uuid/plan-source',
      expected: active(401, 404),
    },
  ],
  'HEAD /api/projects/:id/plan-source': [
    { method: 'HEAD', url: projectUrl('/plan-source'), expected: ownerOnly(409) },
  ],
  // RF-608: the matrix project has no understand run, so the owner's answer is RST-1802 (409).
  'POST /api/projects/:id/plan-options': [
    {
      method: 'POST',
      url: projectUrl('/plan-options'),
      payload: () => ({}),
      expected: ownerOnly(409),
    },
    {
      method: 'POST',
      url: () => '/api/projects/not-a-uuid/plan-options',
      payload: () => ({}),
      expected: active(401, 404),
    },
  ],
};
