import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { json } from './fake-api.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { citationHref } from '../../../web/src/lib/live-run/claim-links.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
import {
  cardProposed,
  citationChecked,
  ev,
  runEnded,
  sourceState,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';
import { tab } from './live-run-running-helpers.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-131, RF-1004: on the run page of an uploaded project the header names the zip, the upload date
// and the snapshot hash, and a claim links to Rosetta's own evidence page for its card, never to an
// external site. The links of a GitHub run are those of RF-1004.

afterEach(() => {
  vi.unstubAllGlobals();
});

const hash = `sha256:${'ab'.repeat(32)}`;
const uploadEvent = {
  stage: 'understand',
  source: {
    kind: 'upload',
    url: '',
    owner: '',
    repo: '',
    ref: '',
    commitSha: null,
    subpath: '',
    snapshotHash: hash,
    fileName: 'OrderDesk.zip',
    uploadedAt: '2026-10-19T09:30:00.000Z',
  },
} as const;
const upload = {
  kind: 'upload',
  fileName: 'OrderDesk.zip',
  uploadedAt: '2026-10-19T09:30:00.000Z',
  snapshotHash: hash,
  runId: runUuid,
  reportBuilt: true,
} as const;
const citation = { path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 };
const claim = { cardId: 'BR-001', claimId: 'BR-001.c1' };

describe('citationHref of an uploaded project', () => {
  it('RF-131 links the cited lines on the evidence page of the card of the run', () => {
    expect(citationHref(upload, citation, claim)).toBe(
      `/runs/${runUuid}/files/report/card-BR-001.html#BR-001%2Ec1:Catalog%2FEdit%2Easpx%2Ecs%3A40-80`,
    );
  });

  it('RF-131 keeps a path with spaces and non-ASCII characters out of the address', () => {
    const href = citationHref(
      upload,
      { path: 'Mis Pedidos/Envío (1).cs', startLine: 5, endLine: 5 },
      claim,
    );

    expect(href).toBe(
      `/runs/${runUuid}/files/report/card-BR-001.html#BR-001%2Ec1:Mis%20Pedidos%2FEnv%C3%ADo%20%281%29%2Ecs%3A5-5`,
    );
  });

  it('RF-131 gives no link for an unusable path, lines, run or claim, and never a GitHub one', () => {
    expect(citationHref(upload, { ...citation, path: '../secret' }, claim)).toBeUndefined();
    expect(citationHref(upload, { ...citation, startLine: 9, endLine: 3 }, claim)).toBeUndefined();
    expect(citationHref({ ...upload, runId: undefined }, citation, claim)).toBeUndefined();
    expect(citationHref({ ...upload, reportBuilt: false }, citation, claim)).toBeUndefined();
    expect(citationHref(upload, citation, undefined)).toBeUndefined();
    expect(citationHref(upload, citation, claim)).not.toContain('github.com');
  });

  it('RF-1004 leaves the link of a GitHub run as it was, with or without the claim', () => {
    const expected =
      'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/Catalog/Edit.aspx.cs#L40-L80';

    expect(citationHref(sourceState, citation)).toBe(expected);
    expect(citationHref(sourceState, citation, claim)).toBe(expected);
  });
});

describe('the source of an uploaded run in the events', () => {
  it('RF-131 reads the zip, the upload date and the hash from run.started', () => {
    const state = stateAfter(ev(1, 'run.started', uploadEvent));

    expect(state.source).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T09:30:00.000Z',
      snapshotHash: hash,
      runId: undefined,
      reportBuilt: false,
    });
  });

  it('RF-131 does not turn the upload into a repository when the source resolves', () => {
    const state = stateAfter(
      ev(1, 'run.started', uploadEvent),
      ev(2, 'source.resolved', { url: '', commitSha: 'a'.repeat(40) }),
    );

    expect(state.source).toMatchObject({ kind: 'upload' });
    expect(state.source).not.toHaveProperty('commitSha');
  });

  it('RF-1004 still reads a GitHub source with no kind', () => {
    expect(stateAfter(ev(1, 'run.started', startedData)).source).toEqual(sourceState);
  });
});

describe('the stepper of an uploaded scan run', () => {
  const row = { stage: 'scan', commitSha: null, reportBuilt: false };
  const snapshotStatus = (event: RunEvent): string | undefined =>
    stepperOf(row, stateAfter(event), { kind: 'running' }).find((each) => each.name === 'Snapshot')
      ?.status;

  it('RF-131 takes the snapshot as done once the hash of the zip is known', () => {
    expect(snapshotStatus(ev(1, 'run.started', uploadEvent))).toBe('done');
  });

  it('RF-131 keeps the snapshot current while the upload has no hash', () => {
    const source = { ...uploadEvent.source, snapshotHash: null };

    expect(snapshotStatus(ev(1, 'run.started', { ...uploadEvent, source }))).toBe('current');
  });
});

describe('the run page of an uploaded project', () => {
  it('RF-131 names the zip, the upload date and the hash in the header', async () => {
    const { stream } = renderLive();
    const connection = await stream.connection();

    connection.event(ev(1, 'run.started', { ...startedData, ...uploadEvent }));

    const name = await screen.findByText('OrderDesk.zip');
    const facts = name.closest('p');
    expect(facts?.textContent).toContain('uploaded 2026-10-19');
    expect(facts?.textContent).toContain('sha256:abababababababab');
    expect(facts?.textContent).not.toContain('github');
  });

  it('RF-131 names only what the run has recorded of the zip', async () => {
    const { stream } = renderLive();
    const connection = await stream.connection();
    const { fileName, uploadedAt, snapshotHash, ...bare } = uploadEvent.source;
    expect([fileName, uploadedAt, snapshotHash]).toHaveLength(3);

    connection.event(ev(1, 'run.started', { ...startedData, source: bare }));

    const name = await screen.findByText('Uploaded zip');
    expect(name.closest('p')?.textContent).toBe('Uploaded zip');
  });
});

describe('the run page of an uploaded project, hostile text and links', () => {
  it('RF-131 shows a file name that is markup as text', async () => {
    const hostile = '<img src=x onerror=alert(1)>.zip';
    const { stream, container } = renderLive();
    const connection = await stream.connection();

    connection.event(
      ev(1, 'run.started', {
        ...startedData,
        source: { ...uploadEvent.source, fileName: hostile },
      }),
    );

    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('RF-131 links a claim to the evidence page of its card in the report of the run', async () => {
    const { stream } = renderLive({ [`GET ${runPath}`]: runRow({ reportBuilt: true }) });
    const connection = await stream.connection();

    connection.event(ev(1, 'run.started', { ...startedData, ...uploadEvent }));
    connection.event(cardProposed(2, 'reader-001', 'BR-001', 1));
    connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));

    const claims = await screen.findByRole('region', { name: 'Claims' });
    await waitFor(() => {
      expect(within(claims).getAllByTestId('claim')).toHaveLength(1);
    });
    const link = within(claims).getByRole('link', { name: 'Catalog/Edit.aspx.cs:40-80' });
    expect(link.getAttribute('href')).toBe(
      `/runs/${runUuid}/files/report/card-BR-001.html#BR-001%2Ec1:Catalog%2FEdit%2Easpx%2Ecs%3A40-80`,
    );
  });
});

describe('the run page of an uploaded project before its report exists', () => {
  async function claimsWith(row: Response) {
    const { stream } = renderLive({ [`GET ${runPath}`]: row });
    const connection = await stream.connection();
    connection.event(ev(1, 'run.started', { ...startedData, ...uploadEvent }));
    connection.event(cardProposed(2, 'reader-001', 'BR-001', 1));
    connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));
    const claims = await screen.findByRole('region', { name: 'Claims' });
    await waitFor(() => {
      expect(within(claims).getAllByTestId('claim')).toHaveLength(1);
    });
    return claims;
  }

  it('RF-131 shows the citation as text with a hint, not as a link that answers 404', async () => {
    const claims = await claimsWith(runRow({ reportBuilt: false }));

    expect(within(claims).queryByRole('link')).toBeNull();
    expect(claims.textContent).toContain('Catalog/Edit.aspx.cs:40-80');
    expect(claims.textContent).toContain('Build the report to open the evidence.');
  });

  it('RF-131 links the citation once the report exists', async () => {
    const claims = await claimsWith(runRow({ reportBuilt: true }));

    expect(within(claims).getByRole('link', { name: 'Catalog/Edit.aspx.cs:40-80' })).toBeTruthy();
    expect(claims.textContent).not.toContain('Build the report');
  });

  it('RF-1004 keeps the GitHub link and shows no hint on a GitHub run', async () => {
    const { stream } = renderLive();
    const connection = await stream.connection();
    connection.event(ev(1, 'run.started', startedData));
    connection.event(cardProposed(2, 'reader-001', 'BR-001', 1));
    connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));
    const claims = await screen.findByRole('region', { name: 'Claims' });

    const link = await within(claims).findByRole('link', { name: 'Catalog/Edit.aspx.cs:40-80' });
    expect(link.getAttribute('href')).toContain('https://github.com/octo/demo/blob/');
    expect(claims.textContent).not.toContain('Build the report');
  });
});

describe('the ended page of an uploaded project', () => {
  it('RF-131 opens the citations as soon as the report is built from the page', async () => {
    const overview = { [`GET ${runPath}/overview`]: json(200, { overview: null }) };
    const built = { [`POST ${runPath}/report`]: json(200, { files: ['report/report.html'] }) };
    const row = runRow({ queueState: 'Ended', endState: 'Completed' });
    const { stream } = renderLive({ [`GET ${runPath}`]: row, ...overview, ...built });
    const connection = await stream.connection();
    connection.event(ev(1, 'run.started', { ...startedData, ...uploadEvent }));
    connection.event(cardProposed(2, 'reader-001', 'BR-001', 1));
    connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));
    connection.event(runEnded(4, 'Completed'));
    fireEvent.click(tab('Evidence'));
    const claims = await screen.findByRole('region', { name: 'Claims' });
    await waitFor(() => {
      expect(within(claims).getAllByTestId('claim')).toHaveLength(1);
    });
    expect(within(claims).queryByRole('link')).toBeNull();

    const build = await screen.findByRole('button', { name: 'Build report' });
    await waitFor(() => {
      expect(build.hasAttribute('disabled')).toBe(false);
    });
    fireEvent.click(build);

    await waitFor(() => {
      expect(within(claims).getByRole('link', { name: 'Catalog/Edit.aspx.cs:40-80' })).toBeTruthy();
    });
  });
});
