import type { Page } from '@playwright/test';
import { z } from 'zod';

// RF-1008, P8-136: the widest row the History Runs table can have, for the 1024 px sweep.

/** The end of the run id of the widest row the 1024 px test adds (the run id of the real run ends `-understand`). */
export const WIDEST_SUFFIX = '-restarted';

/** The end of the id of the copy, so a route can tell its understanding from the real run's. */
const COPY_SUFFIX = '-copy';

const historyBody = z.looseObject({
  runs: z.array(z.looseObject({ id: z.string(), runId: z.string() })),
});
const understandingBody = z.looseObject({ measures: z.looseObject({}).nullable() });

/**
 * P8-136: adds to the History page a copy of the understand run that ended `Interrupted` by a restart
 * with a coverage at the bar, so its row has a Resume button, the badge "Stopped by a restart" and
 * "Well covered" in the Coverage column: the widest row the table has. The copy's understanding is
 * the real run's with its measures raised to the bar.
 */
export async function addWidestRow(page: Page): Promise<void> {
  await page.route('**/api/projects/*/history*', async (route) => {
    const response = await route.fetch();
    const answer = historyBody.parse(await response.json());
    const real = answer.runs.find((run) => run.runId.endsWith('-understand'));
    if (real === undefined) throw new Error('The history has no understand run.');
    const copy = {
      ...real,
      id: `${real.id}${COPY_SUFFIX}`,
      runId: real.runId.replace(/-understand$/u, WIDEST_SUFFIX),
      endState: 'Interrupted',
      endReason: 'Restart',
    };
    await route.fulfill({ response, json: { ...answer, runs: [copy, ...answer.runs] } });
  });
  await page.route(`**/api/runs/*${COPY_SUFFIX}/understanding`, async (route) => {
    const response = await route.fetch({ url: route.request().url().replace(COPY_SUFFIX, '') });
    const answer = understandingBody.parse(await response.json());
    const measures = {
      ...answer.measures,
      firstPartyCoverage: 0.9,
      notJudged: 0,
      wellCovered: true,
    };
    await route.fulfill({ response, json: { ...answer, measures } });
  });
}
