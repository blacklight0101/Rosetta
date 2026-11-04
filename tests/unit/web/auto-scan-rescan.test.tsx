import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, expect, it } from 'vitest';
import { projectSchema, type Project } from '../../../web/src/api/project-schemas.js';
import { useAutoScan } from '../../../web/src/pages/use-auto-scan.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-160, P7-34, P8-10: a source that replaces the stored one is scanned again, but never when a scan
// of the project is already queued or running: the page then waits for that one.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const historyPath = '/api/projects/p-1/history';
const runsPath = '/api/projects/p-1/runs';

const projectWith = (fileName: string | null): Project =>
  projectSchema.parse(
    projectOf('p-1', 'Pricing', {
      sourceKind: 'upload',
      sourceUrl: '',
      source: fileName === null ? null : { fileName, uploadedAt: '2026-11-02T08:00:00.000Z' },
    }),
  );

function Probe() {
  return <Replace first="first.zip" />;
}

/** P8-106: a project that holds no source when the page loads, then gets two uploads in one page session. */
function Empty() {
  return <Replace first={null} />;
}

function Replace({ first }: { readonly first: string | null }) {
  const [project, setProject] = useState(projectWith(first));
  const scan = useAutoScan(project, true, () => undefined);
  const next = project.source === null ? 'first.zip' : 'second.zip';
  return (
    <div>
      <p data-testid="state">{scan.state.kind}</p>
      <button
        type="button"
        onClick={() => {
          setProject(projectWith(next));
        }}
      >
        Replace source
      </button>
    </div>
  );
}

const scanRun = (queueState: string, endState: string | null) => ({
  ...{ id: 'r-9', runId: '20261102-080000-scan', stage: 'scan', queueState, endState },
  ...{ commitSha: null, queuedAt: '2026-11-02T08:00:00.000Z', startedAt: null, endedAt: null },
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  ...{ sizeBytes: 0, failedAreas: 0, unreadAreas: 0, position: 1 },
});

const historyOf = (...runs: readonly object[]): Answer =>
  json(200, {
    project: {
      ...{ id: 'p-1', name: 'Pricing', sourceUrl: '', ref: '', subpath: '' },
      ...{ folder: 'projects/p-1', sizeBytes: 0 },
    },
    runs,
  });

const posts = (calls: readonly { readonly method: string; readonly path: string }[]) =>
  calls.filter((call) => call.method === 'POST' && call.path === runsPath);

it('RF-160 P8-10 a replaced source starts no second scan while one is queued', async () => {
  const { calls } = renderPage(<Probe />, {
    [`GET ${historyPath}`]: historyOf(scanRun('Queued', null)),
  });
  await waitFor(() => {
    expect(screen.getByTestId('state').textContent).toBe('scanning');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Replace source' }));

  await waitFor(() => {
    expect(calls.filter((call) => call.path === historyPath).length).toBeGreaterThan(1);
  });
  expect(posts(calls)).toHaveLength(0);
  expect(screen.getByTestId('state').textContent).toBe('scanning');
});

it('RF-160 P8-10 a replaced source starts one new scan when the last scan has ended', async () => {
  const { calls } = renderPage(<Probe />, {
    [`GET ${historyPath}`]: historyOf(scanRun('Ended', 'Completed')),
    [`POST ${runsPath}`]: json(202, scanRun('Queued', null)),
  });
  await waitFor(() => {
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Replace source' }));

  await waitFor(() => {
    expect(posts(calls)).toHaveLength(1);
  });
  expect(posts(calls)[0]).toMatchObject({ body: { stage: 'scan' } });
});

it('RF-160 P8-106 a replaced source reads as scanning at once, before the history answers', async () => {
  renderPage(<Probe />, {
    [`GET ${historyPath}`]: historyOf(scanRun('Ended', 'Completed')),
    [`POST ${runsPath}`]: json(202, scanRun('Queued', null)),
  });
  await waitFor(() => {
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Replace source' }));

  // The page hides the old areas and Analyse by this state: while it read idle, Analyse could start a
  // run on the code map of the source that was replaced (P8-106).
  expect(screen.getByTestId('state').textContent).toBe('starting');
});

it('RF-160 P8-106 a source replaced after the first upload of the page is scanned again', async () => {
  const { calls } = renderPage(<Empty />, {
    [`GET ${historyPath}`]: historyOf(scanRun('Ended', 'Completed')),
    [`POST ${runsPath}`]: json(202, scanRun('Queued', null)),
  });
  const replace = screen.getByRole('button', { name: 'Replace source' });
  fireEvent.click(replace);
  await waitFor(() => {
    expect(calls.filter((call) => call.path === historyPath).length).toBeGreaterThan(0);
  });
  await waitFor(() => {
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });
  expect(posts(calls)).toHaveLength(0);

  fireEvent.click(replace);

  expect(screen.getByTestId('state').textContent).toBe('starting');
  await waitFor(() => {
    expect(posts(calls)).toHaveLength(1);
  });
});
