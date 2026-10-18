import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-209: the access matrix rows of the Deepen routes. The seeded ended run of the
// matrix is not a completed understand run, so its owner is told it cannot be deepened (RST-2308,
// 409); any other user hears of it as of an unknown run.

const deepenUrl =
  (suffix: string) =>
  (context: Context): string =>
    `/api/runs/${context.endedRunId}/deepen${suffix}`;
const confirmed = (): { confirmed: boolean } => ({ confirmed: true });

export const deepenRows: Readonly<Record<string, readonly Probe[]>> = {
  'POST /api/runs/:runId/deepen': [
    { method: 'POST', url: deepenUrl(''), payload: confirmed, expected: ownerOnly(409) },
    {
      method: 'POST',
      url: () => '/api/runs/not-a-uuid/deepen',
      payload: confirmed,
      expected: active(401, 404),
    },
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
};
