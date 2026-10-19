import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, expect, it } from 'vitest';
import { JourneyPanel } from '../../../web/src/pages/JourneyPanel.js';
import { failure, json, renderPage } from './fake-api.js';
import { facts, planRun, projectId, roadSigns, sourceId } from './journey-fixtures.js';

// RF-615: the panel reads the facts of the journey of the run the page is about and draws the strip.
// What the page shows after a live update is what a reload shows: both read the same facts.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const runPath = `/api/projects/${projectId}/journey?run=${sourceId}`;
const region = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });

function Page({ ticks }: { readonly ticks: readonly string[] }) {
  const [at, setAt] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAt(at + 1);
        }}
      >
        Advance
      </button>
      <JourneyPanel projectId={projectId} runId={sourceId} refresh={ticks[at] ?? ''} />
    </>
  );
}

it('RF-615 reads the facts of the run and draws the strip', async () => {
  const page = renderPage(<JourneyPanel projectId={projectId} runId={sourceId} refresh="a" />, {
    [`GET ${runPath}`]: json(200, roadSigns['estimate']),
  });

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET ${runPath}`]);
  expect(region().textContent).toContain('Review the estimate');
});

it('RF-615 Plan setup opened from the project asks for the journey of the project', async () => {
  const page = renderPage(<JourneyPanel projectId={projectId} runId={undefined} refresh="a" />, {
    [`GET /api/projects/${projectId}/journey`]: json(200, roadSigns['noBrief']),
  });

  await screen.findByRole('region', { name: 'Journey from code to package' });

  expect(page.calls[0]?.path).toBe(`/api/projects/${projectId}/journey`);
});

it('RF-615 says that the journey could not be read, and draws no step, when the run is not found', async () => {
  renderPage(<JourneyPanel projectId={projectId} runId={sourceId} refresh="a" />, {
    [`GET ${runPath}`]: failure(404, 'RST-2003'),
  });

  await screen.findByText(/The journey could not be read/u);

  expect(screen.queryByRole('listitem')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Journey from code to package' })).toBeNull();
});

it('RF-615 reads the facts again when the run changes state, and shows what a reload shows', async () => {
  let reads = 0;
  const read = (): Response =>
    json(200, reads++ === 0 ? roadSigns['planning'] : roadSigns['failed']);
  renderPage(<Page ticks={['running', 'ended']} />, { [`GET ${runPath}`]: read });
  await waitFor(() => {
    expect(region().textContent).toContain('Running now');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Advance' }));

  await waitFor(() => {
    expect(region().textContent).toContain('Try the plan again');
  });
  const live = region().textContent;
  document.body.innerHTML = '';
  renderPage(<JourneyPanel projectId={projectId} runId={sourceId} refresh="reload" />, {
    [`GET ${runPath}`]: json(200, roadSigns['failed']),
  });
  await waitFor(() => {
    expect(region().textContent).toBe(live);
  });
});

it('RF-615 does not read again while the run is in the same state', async () => {
  const page = renderPage(<Page ticks={['same', 'same']} />, {
    [`GET ${runPath}`]: json(200, facts({ plan: planRun() })),
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });

  fireEvent.click(screen.getByRole('button', { name: 'Advance' }));

  expect(page.calls.filter((call) => call.path === runPath)).toHaveLength(1);
});

it('RF-615 a later read that fails keeps the strip the page has', async () => {
  let reads = 0;
  const read = (): Response =>
    reads++ === 0 ? json(200, roadSigns['planning']) : failure(500, 'RST-9000');
  renderPage(<Page ticks={['running', 'ended']} />, { [`GET ${runPath}`]: read });
  await waitFor(() => {
    expect(region().textContent).toContain('Running now');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Advance' }));

  await waitFor(() => {
    expect(reads).toBe(2);
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(region().textContent).toContain('Running now');
  expect(screen.queryByText(/The journey could not be read/u)).toBeNull();
});

it('RF-615 a read that is answered after a newer one was asked for is dropped', async () => {
  const slow: { release: () => void } = { release: () => undefined };
  let reads = 0;
  const read = (): Response | Promise<Response> => {
    if (reads++ > 0) return json(200, roadSigns['failed']);
    return new Promise((resolve) => {
      slow.release = () => {
        resolve(json(200, roadSigns['planning']));
      };
    });
  };
  renderPage(<Page ticks={['running', 'ended']} />, { [`GET ${runPath}`]: read });
  fireEvent.click(screen.getByRole('button', { name: 'Advance' }));
  await waitFor(() => {
    expect(region().textContent).toContain('Try the plan again');
  });

  slow.release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(region().textContent).toContain('Try the plan again');
  expect(region().textContent).not.toContain('Running now');
});

it('RF-615 RF-006 Resume in the strip opens the run page of the source run unless the page says otherwise', async () => {
  window.history.pushState({}, '', '/projects/p-1/plan-setup');
  renderPage(<JourneyPanel projectId={projectId} runId={sourceId} refresh="a" />, {
    [`GET ${runPath}`]: json(200, roadSigns['capped']),
    [`POST /api/runs/${sourceId}/resume`]: json(202, { id: sourceId }),
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });

  fireEvent.click(screen.getByRole('button', { name: 'Resume this run' }));

  await waitFor(() => {
    expect(window.location.pathname).toBe(`/runs/${sourceId}`);
  });
});
