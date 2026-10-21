import { screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { projectOf } from './project-fixtures.js';
import { estimatePath, noCodeMap, projectPath } from './start-run-fixtures.js';
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

it('RF-1001 with no finished scan the page does not ask for the estimate and offers the scan', async () => {
  const { calls } = renderStart({
    [`GET ${journeyPath}`]: journeyOf(null),
    [`GET ${estimatePath}`]: noCodeMap,
  });

  await screen.findByText(/Run a scan first/u);

  expect(asked(calls)).toBe(false);
  expect(screen.getByLabelText('Scan only')).toHaveProperty('checked', true);
});

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

const stored = { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T08:00:00.000Z' };

it.each([
  ['upload', 'upload'],
  ['workbook', 'workbook'],
] as const)(
  'RF-150 the scan note of a %s project says the code or workbooks',
  async (_name, sourceKind) => {
    renderStart({
      [`GET ${projectPath}`]: json(
        200,
        projectOf('p-1', 'Pricing', { sourceKind, sourceUrl: '', source: stored }),
      ),
      [`GET ${estimatePath}`]: noCodeMap,
    });

    await screen.findByText(/A scan reads the code or workbooks/u);

    expect(screen.queryByText(/reads the repository/u)).toBeNull();
  },
);

it('RF-1001 the scan note of a GitHub project keeps the repository', async () => {
  renderStart({ [`GET ${estimatePath}`]: noCodeMap });

  const note = await screen.findByText(/A scan reads the repository and writes the code map/u);

  expect(note.textContent).not.toContain('workbooks');
});
