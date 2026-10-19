import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { citationHref } from '../../../web/src/lib/live-run/claim-links.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
import { cardProposed, citationChecked, ev, startedData, stateAfter } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-156, RF-1004: on the run page of a workbook project the header names the workbooks, the upload
// date and the snapshot hash, and a claim links to Rosetta's own evidence page for its card, never to
// an external site.

afterEach(() => {
  vi.unstubAllGlobals();
});

const hash = `sha256:${'cd'.repeat(32)}`;
const workbookEvent = {
  stage: 'understand',
  source: {
    kind: 'workbook',
    url: '',
    owner: '',
    repo: '',
    ref: '',
    commitSha: null,
    subpath: '',
    snapshotHash: hash,
    uploadedAt: '2026-10-19T09:30:00.000Z',
    workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
  },
} as const;
const citation = { path: 'Pricing.xlsx/Summary/formulas.md', startLine: 2, endLine: 3 };
const claim = { cardId: 'BR-001', claimId: 'BR-001.c1' };

describe('the source of a workbook run in the events', () => {
  it('RF-156 reads the workbooks, the upload date and the hash from run.started', () => {
    const state = stateAfter(ev(1, 'run.started', workbookEvent));

    expect(state.source).toEqual({
      kind: 'upload',
      fileName: undefined,
      workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
      uploadedAt: '2026-10-19T09:30:00.000Z',
      snapshotHash: hash,
      runId: undefined,
      reportBuilt: false,
    });
  });

  it('RF-156 reads a workbook run that names no workbook as an empty list', () => {
    const { workbooks, ...bare } = workbookEvent.source;
    expect(workbooks).toHaveLength(2);

    const state = stateAfter(ev(1, 'run.started', { ...workbookEvent, source: bare }));

    expect(state.source).toMatchObject({ kind: 'upload', workbooks: [] });
  });

  it('RF-156 does not turn the workbooks into a repository when the source resolves', () => {
    const state = stateAfter(
      ev(1, 'run.started', workbookEvent),
      ev(2, 'source.resolved', { url: '', commitSha: 'a'.repeat(40) }),
    );

    expect(state.source).not.toHaveProperty('commitSha');
  });

  it('RF-131 leaves the state of a zip with no workbook list', () => {
    const zip = { ...workbookEvent.source, kind: 'upload', fileName: 'OrderDesk.zip' } as const;

    const state = stateAfter(ev(1, 'run.started', { ...workbookEvent, source: zip }));

    expect(state.source).toMatchObject({ kind: 'upload', fileName: 'OrderDesk.zip' });
    expect(state.source).toMatchObject({ workbooks: undefined });
  });
});

describe('citationHref of a workbook project', () => {
  const source = {
    kind: 'upload',
    fileName: undefined,
    workbooks: ['Pricing.xlsx'],
    uploadedAt: undefined,
    snapshotHash: hash,
    runId: runUuid,
    reportBuilt: true,
  } as const;

  it('RF-156 links the cited lines on the evidence page of the card of the run', () => {
    const href = citationHref(source, citation, claim);

    expect(href).toBe(
      `/runs/${runUuid}/files/report/card-BR-001.html#BR-001%2Ec1:Pricing%2Exlsx%2FSummary%2Fformulas%2Emd%3A2-3`,
    );
    expect(href).not.toContain('github.com');
  });
});

describe('the stepper of a workbook scan run', () => {
  it('RF-156 takes the snapshot as done once the hash of the workbooks is known', () => {
    const row = { stage: 'scan', commitSha: null, reportBuilt: false };

    const status = stepperOf(row, stateAfter(ev(1, 'run.started', workbookEvent)), {
      kind: 'running',
    }).find((each) => each.name === 'Snapshot')?.status;

    expect(status).toBe('done');
  });
});

describe('the run page of a workbook project', () => {
  it('RF-156 names the workbooks, the upload date and the hash in the header', async () => {
    const { stream } = renderLive();
    const connection = await stream.connection();

    connection.event(ev(1, 'run.started', { ...startedData, ...workbookEvent }));

    const name = await screen.findByText('Pricing.xlsx, Rates.xlsm');
    const facts = name.closest('p');
    expect(facts?.textContent).toContain('uploaded 2026-10-19');
    expect(facts?.textContent).toContain('sha256:cdcdcdcdcdcdcdcd');
    expect(facts?.textContent).not.toContain('github');
    expect(facts?.textContent).not.toContain('zip');
  });

  it('RF-156 says Excel workbooks when the run has not recorded their names', async () => {
    const { stream } = renderLive();
    const connection = await stream.connection();
    const { workbooks, ...bare } = workbookEvent.source;
    expect(workbooks).toHaveLength(2);

    connection.event(ev(1, 'run.started', { ...startedData, source: bare }));

    const name = await screen.findByText('Excel workbooks');
    expect(name.closest('p')?.textContent).toContain('Excel workbooks');
    expect(name.closest('p')?.textContent).not.toContain('zip');
  });

  it('RF-156 shows a workbook name that is markup as text', async () => {
    const hostile = '<img src=x onerror=alert(1)>.xlsx';
    const { stream, container } = renderLive();
    const connection = await stream.connection();

    connection.event(
      ev(1, 'run.started', {
        ...startedData,
        source: { ...workbookEvent.source, workbooks: [hostile] },
      }),
    );

    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('RF-156 links a claim to the evidence page of its card in the report of the run', async () => {
    const { stream } = renderLive({ [`GET ${runPath}`]: runRow({ reportBuilt: true }) });
    const connection = await stream.connection();

    connection.event(ev(1, 'run.started', { ...startedData, ...workbookEvent }));
    connection.event(cardProposed(2, 'reader-001', 'BR-001', 1));
    connection.event(citationChecked(3, 'reader-001', 'BR-001.c1', true));

    const claims = await screen.findByRole('region', { name: 'Claims' });
    await waitFor(() => {
      expect(within(claims).getAllByTestId('claim')).toHaveLength(1);
    });
    const links = within(claims).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      expect.stringContaining(`/runs/${runUuid}/files/report/card-BR-001.html#`),
    ]);
    expect(claims.innerHTML).not.toContain('github.com');
  });
});
