import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { hostileCard, plainCard, reportModel } from '../../../support/report-fixtures.js';

// RF-504, RF-507: `report.md` links the specification, every card, the coverage and the cost
// report, says so when a document does not exist, and shows no model text as markup or as a link.

const masker = new SecretMasker();

const expected = `# Report for run 20261012-100000-understand

| | |
|---|---|
| Stage | understand |
| State | Completed |
| Source | [octo/demo @ 3f786850e387](https://github.com/octo/demo/tree/3f786850e387550fdab836ed7e6dc881de23001b) |
| Started | 2026-10-12T10:00:00.000Z |
| Ended | 2026-10-12T10:00:48.000Z |
| Cost | $0.0040 (3 calls, 3600 tokens in, 330 out) |

## Documents

- [Specification](../spec.md)
- Coverage: not available for this run (the coverage report is written by a later release).
- [Cost report](../cost.md)
- [Run replay](replay.html)
- [This report as static HTML](report.html)

## Verification summary

Supported share: 1 of 1 claim (100.0%).

| Area | Proposed | CitationInvalid | Supported | Rejected | Unverified | Total | Supported share |
|---|---|---|---|---|---|---|---|
| orders | 0 | 0 | 1 | 0 | 0 | 1 | 100.0% |
| All areas | 0 | 0 | 1 | 0 | 0 | 1 | 100.0% |

## Cards

1 card, 1 claim: 1 Supported.

| Card | Type | Area | Claims | Title |
|---|---|---|---|---|
| [BR-001](../cards/BR/BR-001.md) | BR | orders | 1 Supported | Free shipping over 50 |
`;

describe('renderReportMarkdown', () => {
  it('RF-504 matches the snapshot of a finished run', () => {
    expect(renderReportMarkdown(reportModel(), masker)).toBe(expected);
  });

  it('RF-504 links the coverage report when the run folder has it', () => {
    const markdown = renderReportMarkdown(
      reportModel({ documents: { spec: true, coverage: true, cost: true } }),
      masker,
    );

    expect(markdown).toContain('- [Coverage](../coverage.md)');
    expect(markdown).not.toContain('not available');
  });
});

describe('renderReportMarkdown documents and cards', () => {
  it('RF-504 says which documents are missing instead of linking them', () => {
    const markdown = renderReportMarkdown(
      reportModel({ documents: { spec: false, coverage: false, cost: false } }),
      masker,
    );

    expect(markdown).not.toContain('](../spec.md)');
    expect(markdown).not.toContain('](../cost.md)');
    expect(markdown).toContain('- Specification: not available for this run.');
    expect(markdown).toContain('- Cost report: not available for this run.');
  });

  it('RF-504 links every card and sorts nothing away', () => {
    const second = { ...plainCard, id: 'BR-002', title: 'Second', path: 'cards/BR/BR-002.md' };
    const markdown = renderReportMarkdown(reportModel({ cards: [plainCard, second] }), masker);

    expect(markdown).toContain('2 cards, 2 claims: 2 Supported.');
    expect(markdown).toContain('[BR-001](../cards/BR/BR-001.md)');
    expect(markdown).toContain('[BR-002](../cards/BR/BR-002.md)');
  });

  it('RF-504 names a run with no cards and gives a card without a valid path no link', () => {
    const none = renderReportMarkdown(reportModel({ cards: [] }), masker);
    const unlinked = renderReportMarkdown(
      reportModel({ cards: [{ ...plainCard, path: '' }] }),
      masker,
    );

    expect(none).toContain('No cards.');
    expect(unlinked).toContain('| BR-001 | BR |');
    expect(unlinked).not.toContain('](../cards/');
  });

  it('RF-504 leaves out the fields a run that has not ended does not have', () => {
    const markdown = renderReportMarkdown(
      reportModel({ endState: null, endedAt: null, totals: null, source: null }),
      masker,
    );

    expect(markdown).toContain('| State | Not ended |');
    expect(markdown).not.toContain('| Ended |');
    expect(markdown).not.toContain('| Cost |');
    expect(markdown).not.toContain('| Source |');
  });
});

describe('renderReportMarkdown and untrusted text', () => {
  it('RF-507 shows markup and links in a title as text', () => {
    const markdown = renderReportMarkdown(reportModel({ cards: [hostileCard] }), masker);
    const row = markdown.split('\n').find((line) => line.startsWith('| [BR-002]')) ?? '';

    expect(dangerousIn(row)).toBeUndefined();
    expect(dangerousIn(row)).toBeUndefined();
    expect(row).toContain('\\<script>');
    expect(row.match(/(?<!\\)\]\(/gu)).toHaveLength(1);
  });

  it('RF-507 keeps the only live links the ones Rosetta builds', () => {
    const markdown = renderReportMarkdown(reportModel({ cards: [hostileCard] }), masker);
    const links = [...markdown.matchAll(/(?<!\\)\[(?:[^\]]|\\\])*(?<!\\)\]\(([^)]*)\)/gu)].map(
      (match) => match[1],
    );

    expect(links).toEqual([
      'https://github.com/octo/demo/tree/3f786850e387550fdab836ed7e6dc881de23001b',
      '../spec.md',
      '../cost.md',
      'replay.html',
      'report.html',
      '../cards/BR/BR-002.md',
    ]);
  });

  it('RNF-003 masks a secret in model text before it is written', () => {
    const markdown = renderReportMarkdown(
      reportModel({ cards: [{ ...plainCard, title: `Key ${fakeOpenAiKey} in code` }] }),
      masker,
    );

    expect(markdown).not.toContain(fakeOpenAiKey);
  });
});

describe('renderReportMarkdown and the map level', () => {
  it('RF-112 states the map level of every area, escaped like the other repository text', () => {
    const markdown = renderReportMarkdown(
      reportModel({
        areas: [
          { name: 'LEDGER', mapLevel: 'coarse' },
          { name: '<b>orders</b>', mapLevel: 'symbols' },
        ],
      }),
      masker,
    );

    expect(markdown).toContain(
      ['## Areas', '', '| Area | Map level |', '|---|---|', '| LEDGER | coarse |'].join('\n'),
    );
    expect(markdown).toContain('| symbols |');
    expect(dangerousIn(markdown)).toBeUndefined();
  });

  it('RF-112 leaves out the areas section when the report has no code map', () => {
    expect(renderReportMarkdown(reportModel({ areas: [] }), masker)).not.toContain('## Areas');
  });
});
