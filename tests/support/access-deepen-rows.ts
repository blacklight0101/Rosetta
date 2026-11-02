import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-209, RF-432: the access matrix rows of the Deepen routes and of Continue. The seeded ended run of the
// matrix is not a completed understand run, so its owner is told it cannot be deepened (RST-2308,
// 409); any other user hears of it as of an unknown run.

const deepenUrl =
  (suffix: string) =>
  (context: Context): string =>
    `/api/runs/${context.endedRunId}/deepen${suffix}`;
const confirmed = (): { confirmed: boolean } => ({ confirmed: true });

export const deepenRows: Readonly<Record<string, readonly Probe[]>> = {
  // RF-432: Continue (+N) answers only the owner; the seeded ended run is not paused (409).
  'POST /api/runs/:runId/continue': [
    {
      method: 'POST',
      url: (context) => `/api/runs/${context.endedRunId}/continue`,
      expected: ownerOnly(409),
    },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/continue', expected: active(401, 404) },
  ],
  'POST /api/runs/:runId/deepen': [
    { method: 'POST', url: deepenUrl(''), payload: confirmed, expected: ownerOnly(409) },
    {
      method: 'POST',
      url: () => '/api/runs/not-a-uuid/deepen',
      payload: confirmed,
      expected: active(401, 404),
    },
  ],
  // The seeded ended run is a scan: its owner is answered with no measures, anyone else 404.
  'GET /api/runs/:runId/understanding': [
    {
      method: 'GET',
      url: (context) => `/api/runs/${context.endedRunId}/understanding`,
      expected: ownerOnly(200),
    },
    { method: 'GET', url: () => '/api/runs/not-a-uuid/understanding', expected: active(401, 404) },
  ],
  'POST /api/runs/:runId/deepen/estimate': [
    { method: 'POST', url: deepenUrl('/estimate'), payload: () => ({}), expected: ownerOnly(409) },
    {
      method: 'POST',
      url: () => '/api/runs/not-a-uuid/deepen/estimate',
      payload: () => ({}),
      expected: active(401, 404),
    },
  ],
  // P7-26: the overview alone, for a run that ended at a cap; the seeded run completed (409).
  'POST /api/runs/:runId/overview': [
    {
      method: 'POST',
      url: (context) => `/api/runs/${context.endedRunId}/overview`,
      expected: ownerOnly(409),
    },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/overview', expected: active(401, 404) },
  ],
};
