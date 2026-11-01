import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { estimatePath, projectPath } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';

// RF-1001, RF-425 (P3-68): the start page of a project without a scan does not ask for the
// understand estimate (the browser would log the 409), and its scan text names what the project
// holds. The journey says whether a scan finished (journey-routes.ts).

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const journeyPath = `${projectPath}/journey`;
const journeyOf = (scanRunId: string | null) =>
  json(200, { source: null, scanRunId, briefSaved: false, plan: null, handoff: null });

const asked = (calls: readonly { readonly path: string }[]): boolean =>
  calls.some((call) => call.path.startsWith(estimatePath));

it('RF-425 with a finished scan the page asks for the estimate', async () => {
  const { calls } = renderStart({ [`GET ${journeyPath}`]: journeyOf('r-1') });

  await ready();

  expect(asked(calls)).toBe(true);
});

it('RF-425 when the journey cannot be read the page still asks for the estimate', async () => {
  const { calls } = renderStart({ [`GET ${journeyPath}`]: failure(500, 'RST-2006') });

  await ready();

  expect(asked(calls)).toBe(true);
});
