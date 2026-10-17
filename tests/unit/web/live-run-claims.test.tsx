import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
} from './live-run-fixtures.js';
import { json } from './fake-api.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';
import { openTabWhenReady } from './live-run-running-helpers.js';

// RF-1002..RF-1006, RF-1108, RF-008, RF-507, DEC-103 (P1-35): the claims, downloads and refusal of the live run page. Whatever the page shows comes from
// the events the test pushes into the fake stream.

const WAITING_NOTE = "Claims that passed the citation check wait for the verifier's judgement.";
const NOT_JUDGED_NOTE =
  'Citations checked means the cited lines exist; those claims were not judged.';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('RF-1014 lists the claims with their status, reason and a link to the cited lines', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(cardProposed(3, 'reader-001', 'BR-001', 2));
  connection.event(citationChecked(4, 'reader-001', 'BR-001.c1', true));
  connection.event(
    citationChecked(5, 'reader-001', 'BR-001.c2', 'line 140 is past the end of the file'),
  );

  const claims = await screen.findByRole('region', { name: 'Claims' });
  await waitFor(() => {
    expect(within(claims).getAllByTestId('claim')).toHaveLength(2);
  });
  const [first = claims, second] = within(claims).getAllByTestId('claim');
  expect(first.textContent).toContain('BR-001.c1');
  expect(first.textContent).toContain('Waiting for judgement');
  expect(claims.textContent).toContain(WAITING_NOTE);
  expect(claims.textContent).not.toContain('later version');
  expect(screen.getByTestId('journey').textContent).toContain('2 of 2 citations checked');
  expect(screen.getByTestId('journey').textContent).not.toContain('later version');
  const link = within(first).getByRole('link', {
    name: 'Catalog/Edit.aspx.cs:40-80',
  });
  expect(link.getAttribute('href')).toBe(
    'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/Catalog/Edit.aspx.cs#L40-L80',
  );
  expect(second?.textContent).toContain('Citation invalid');
  expect(second?.textContent).toContain('line 140 is past the end of the file');
  const agents = await openTabWhenReady('All agents');
  const overview = within(agents).getByRole('region', { name: 'Overview' });
  expect(overview.textContent).toContain('1 citations checked');
  expect(overview.textContent).toContain(WAITING_NOTE);
  expect(overview.textContent).not.toContain('later version');
});

it('RF-1014 RF-301 shows the verdict once the judgement step ends, and a claim left unjudged as not judged', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(cardProposed(2, 'reader-001', 'BR-001', 2));
  connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));
  connection.event(citationChecked(4, 'reader-001', 'BR-001.c2', true));
  connection.event(ev(5, 'verify.judgement.started', { claims: 2 }));
  const claims = await screen.findByRole('region', { name: 'Claims' });
  await waitFor(() => {
    expect(within(claims).getAllByTestId('claim')).toHaveLength(2);
  });

  const reason = 'Line 7 sets the label.';
  const verdict = { claimId: 'BR-001.c1', status: 'Supported', reason };
  connection.event(ev(6, 'verify.claim.judged', verdict));
  connection.event(runEnded(7, 'Interrupted'));

  const [first = claims, second = claims] = within(claims).getAllByTestId('claim');
  await waitFor(() => {
    expect(first.textContent).toContain('Supported');
  });
  expect(first.textContent).toContain(reason);
  expect(second.textContent).toContain('Citations checked');
  expect(second.textContent).not.toContain('Waiting');
  expect(claims.textContent).toContain(NOT_JUDGED_NOTE);
  expect(claims.textContent).not.toContain(WAITING_NOTE);
  expect(claims.textContent).not.toContain('later version');
});

it('RF-1004 a claim changes its status and reason when the verdict arrives', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(cardProposed(2, 'reader-001', 'BR-001'));
  connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));
  const claim = await screen.findByTestId('claim');
  await waitFor(() => {
    expect(claim.textContent).toContain('Waiting for judgement');
  });

  connection.event(
    ev(4, 'verify.claim.judged', {
      claimId: 'BR-001.c1',
      status: 'Rejected',
      reason: 'the lines do not set the price',
    }),
  );

  await waitFor(() => {
    expect(claim.textContent).toContain('Rejected');
  });
  expect(claim.textContent).toContain('the lines do not set the price');
  expect(claim.textContent).not.toContain('Citations checked');
  expect(claim.textContent).not.toContain('Waiting for judgement');
});

it('RF-507 shows the text of a claim and of a card as text, never as markup', async () => {
  const { stream, container } = renderLive();
  const connection = await stream.connection();
  const hostile = '<img src=x onerror=alert(1)> <script>alert(2)</script> **bold**';

  connection.event(ev(1, 'run.started', startedData));
  connection.event(
    ev(2, 'verify.citation.checked', {
      claimId: 'BR-001.c1',
      ok: true,
      text: hostile,
      citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }],
    }),
  );
  connection.event(
    ev(
      3,
      'agent.card.proposed',
      { cardId: 'BR-001', type: 'BR', title: hostile, claims: 1 },
      'reader-001',
    ),
  );

  const claim = await screen.findByTestId('claim');
  await waitFor(() => {
    expect(claim.textContent).toContain(hostile);
  });
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});

it('RF-008 offers no download while the run is queued or running and the zip when it ends', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  await screen.findByRole('tablist', { name: 'Run details' });
  expect(screen.queryByRole('button', { name: 'Download zip' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Download zip' })).toBeNull();

  connection.event(runEnded(2, 'Completed'));

  const link = await screen.findByRole('link', { name: 'Download zip' });
  expect(link.getAttribute('href')).toBe(`/api/runs/${runUuid}/zip`);
  expect(screen.queryByRole('link', { name: 'Download hand-off zip' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Download hand-off zip' }).getAttribute('title'),
  ).toMatch(/plan/u);
});

it('RF-008 offers the hand-off zip of a plan run once it has ended', async () => {
  const { stream } = renderLive({ [`GET ${runPath}`]: runRow({ stage: 'plan' }) });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'plan' }));
  connection.event(runEnded(2, 'Completed'));

  const link = await screen.findByRole('link', { name: 'Download hand-off zip' });

  expect(link.getAttribute('href')).toBe(`/api/runs/${runUuid}/handoff.zip`);
});

it('RF-1108 RST-2302 shows a run that was refused for a missing key with its code, message and next step', async () => {
  const { stream } = renderLive({
    'GET /api/errors/RST-2302': json(200, {
      code: 'RST-2302',
      message: 'There is no API key you may use for this provider.',
      nextStep: 'Save your own key for it in your settings.',
    }),
  });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(runEnded(2, 'Failed', 'RST-2302'));

  const refusal = await screen.findByTestId('run-failure');
  expect(refusal.textContent).toContain('RST-2302');
  await waitFor(() => {
    expect(refusal.textContent).toContain('There is no API key you may use for this provider.');
  });
  expect(
    within(refusal).getByRole('link', { name: 'Settings and keys' }).getAttribute('href'),
  ).toBe('/settings');
  expect(screen.getByTestId('run-status').textContent).toContain('Failed');
});
