import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runUuid } from './live-run-helpers.js';

// RF-504, RF-506, DEC-131 (P1-97): the "Build report" control of the live run page. The report is
// built when the owner asks, never while the run is queued or running; the page then links the
// report and the replay page. Everything the page shows comes from the fake API's answers.

const reportPath = `${runPath}/report`;
const built = json(200, {
  files: [
    'report/replay.html',
    'report/replay.js',
    'report/report.css',
    'report/report.html',
    'report/report.md',
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function endedRun(answers: Parameters<typeof renderLive>[0]) {
  const page = renderLive(answers);
  const connection = await page.stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(runEnded(2, 'Completed'));
  return page;
}

it('RF-504 keeps Build report disabled, with the reason, while the run is running', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  const button = await screen.findByRole('button', { name: 'Build report' });

  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.getAttribute('title')).toBe('Available when the run ends.');
});

it('RF-504 builds the report of an ended run from the page and links the report and the replay', async () => {
  const { calls } = await endedRun({ [`POST ${reportPath}`]: built });
  const button = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });
  expect(screen.queryByRole('link', { name: /replay/iu })).toBeNull();

  fireEvent.click(button);

  const replay = await screen.findByRole('link', { name: 'Open the run replay' });
  expect(replay.getAttribute('href')).toBe(`/runs/${runUuid}/files/report/replay.html`);
  expect(screen.getByRole('link', { name: 'Open the report' }).getAttribute('href')).toBe(
    `/runs/${runUuid}/files/report/report.html`,
  );
  expect(
    screen.getByRole('link', { name: 'Open the report as Markdown' }).getAttribute('href'),
  ).toBe(`/runs/${runUuid}/files/report/report.md`);
  const posts = calls.filter((call) => call.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]?.path).toBe(reportPath);
  expect(posts[0]?.csrf).toBe('csrf-0');
});

it('RF-504 DEC-131 says in a plain sentence that the run is still in progress when the server answers 409', async () => {
  await endedRun({ [`POST ${reportPath}`]: failure(409, 'RST-1700') });
  const button = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  fireEvent.click(button);

  const notice = await screen.findByRole('alert');
  expect(notice.textContent).toContain('Message of RST-1700.');
  expect(notice.textContent).toContain('Next step of RST-1700.');
  expect(notice.textContent).not.toContain('RST-1700 ');
  expect(screen.queryByRole('link', { name: 'Open the run replay' })).toBeNull();
});

it("RF-1105 shows the catalogue's error when the run is not found", async () => {
  await endedRun({ [`POST ${reportPath}`]: failure(404, 'RST-2003') });
  const button = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  fireEvent.click(button);

  expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2003');
  expect(screen.queryByRole('link', { name: 'Open the run replay' })).toBeNull();
});

it('RF-504 sends one request when Build report is pressed twice in a row', async () => {
  const { calls } = await endedRun({ [`POST ${reportPath}`]: built });
  const button = await screen.findByRole('button', { name: 'Build report' });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.dblClick(button);

  await screen.findByRole('link', { name: 'Open the run replay' });
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
});
