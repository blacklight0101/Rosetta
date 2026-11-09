import { describe, expect, it } from 'vitest';
import { projectCostSchema } from '../../../web/src/api/cost-schemas.js';
import { projectCost, usageTotals } from './cost-fixtures.js';

// RF-426, RF-428: the project cost response carries, for each run, its cost per role (P8-108);
// the wire schema must keep reading it under that name.

type RunWire = Record<string, unknown>;

/** The response as it comes over the wire, with `change` applied to the first run line. */
function responseWith(change: (run: RunWire) => void): unknown {
  const run: RunWire = { ...projectCost.byRun[0] };
  change(run);
  return { ...projectCost, byRun: [run] };
}

describe('projectCostSchema byRole per run', () => {
  it('RF-428 reads the role lines of each run from a project cost response', () => {
    const parsed = projectCostSchema.parse(responseWith(() => undefined));

    expect(parsed.byRun[0]?.byRole).toEqual([
      { key: 'reader', local: false, totals: usageTotals({ calls: 2 }) },
    ]);
  });

  it('RF-428 refuses a run line that has no byRole', () => {
    const body = responseWith((run) => Reflect.deleteProperty(run, 'byRole'));

    expect(projectCostSchema.safeParse(body).success).toBe(false);
  });
});
