import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { checkPublishedIndex } from '../../../../src/infrastructure/report/index-check.js';
import {
  buildSiteFiles,
  type ReportSiteAssets,
} from '../../../../src/infrastructure/report/published-site.js';
import { auditHtml } from '../../../support/html-audit.js';
import {
  areaPageName,
  cardPageName,
} from '../../../../src/infrastructure/report/site/page-names.js';
import {
  hostileCard,
  plainCard,
  plainDetail,
  reportModel,
} from '../../../support/report-fixtures.js';

// RF-800, RF-501, RF-507, RNF-003: the files of the published sample report (the `site/` folder of
// `main`) and the check of its index that the Pages smoke step runs.

const runKey = '20261012-100000-understand';
const assets: ReportSiteAssets = { 'report.css': 'body {}', 'replay.js': 'void 0;' };
const documents = {
  'spec.md': '# Specification\n\n- [card file](cards/BR/BR-001.md)\n',
  'cost.md': '# Cost\n',
  'cards/BR/BR-001.md': '# BR-001\n',
} as const;
const masker = new SecretMasker();
const htmlPages = [
  'index.html',
  'report.html',
  'replay.html',
  'questions.html',
  'cost.html',
] as const;

function siteOf(cards = reportModel().cards): Readonly<Record<string, string>> {
  return buildSiteFiles(reportModel({ cards }), assets, masker, documents);
}

describe('buildSiteFiles', () => {
  it('RF-800 writes the static site: the index, the report, the replay, the run documents, their assets and .nojekyll', () => {
    const site = siteOf();

    expect(Object.keys(site).sort()).toEqual(
      [
        '.nojekyll',
        areaPageName('catalog'),
        areaPageName('orders'),
        'cards/BR/BR-001.md',
        'cost.html',
        'cost.md',
        'index.html',
        'questions.html',
        'replay.html',
        'replay.js',
        'report.css',
        'report.html',
        'report.md',
        'spec.md',
      ].sort(),
    );
    expect(site['.nojekyll']).toBe('');
  });
});

describe('buildSiteFiles area and card pages', () => {
  const withDetail = buildSiteFiles(
    reportModel({ cardDetails: [plainDetail] }),
    assets,
    masker,
    documents,
  );

  it('RF-500 publishes the page of each card that has one, beside the others', () => {
    expect(Object.keys(withDetail)).toEqual(expect.arrayContaining([cardPageName('BR-001')]));
    expect(withDetail[cardPageName('BR-001')]).toContain('Gift orders also ship free.');
  });

  it('RF-501 links the card file and the pages inside the site, not one folder up', () => {
    const page = withDetail[cardPageName('BR-001')] ?? '';

    expect(page).not.toContain('href="../');
    expect(page).toContain('href="cards/BR/BR-001.md"');
    expect(auditHtml(page).foreignLinks).toEqual([]);
    expect(withDetail['report.html']).toContain(`href="${cardPageName('BR-001')}"`);
  });
});

describe('buildSiteFiles and masking of the pages', () => {
  it('RNF-003 masks a key in a cited line of a published card page', () => {
    const fakeKey = ['sk', `ant-${'x'.repeat(24)}`].join('-');
    const leaky = buildSiteFiles(
      reportModel({
        cardDetails: [
          {
            ...plainDetail,
            claims: [
              {
                claimId: 'BR-001.c1',
                text: 'x',
                status: 'Supported',
                citations: [
                  {
                    path: 'a.cs',
                    startLine: 1,
                    endLine: 1,
                    excerpt: { kind: 'lines', firstLine: 1, lines: [`key ${fakeKey}`] },
                  },
                ],
              },
            ],
          },
        ],
      }),
      assets,
      masker,
      documents,
    );

    expect(leaky[cardPageName('BR-001')] ?? '').not.toContain(fakeKey);
  });
});

describe('buildSiteFiles pages', () => {
  it('RF-800 the index shows the run and links the report and the run replay', () => {
    const index = siteOf()['index.html'] ?? '';

    expect(index).toContain(`<span class="mono">${runKey}</span>`);
    expect(index).toContain('href="report.html"');
    expect(index).toContain('href="replay.html"');
    expect(index).toContain('href="questions.html"');
    expect(index).toContain('href="cost.html"');
  });

  it('RF-800 the report links the run documents inside the site, not one folder up', () => {
    const report = siteOf()['report.html'] ?? '';

    expect(report).not.toContain('href="../');
    expect(report).toContain('href="spec.md"');
  });

  it('RF-501 every page loads its files from the site and no other address', () => {
    const site = siteOf();

    for (const name of htmlPages) {
      expect(auditHtml(site[name] ?? '').foreignLinks).toEqual([]);
    }
  });

  it('RF-507 a card that holds markup runs nothing: only the replay script loads', () => {
    const hostile = siteOf([plainCard, hostileCard]);
    const [index, report, replay, questions, cost] = htmlPages.map((name) =>
      auditHtml(hostile[name] ?? ''),
    );

    expect(index?.scripts).toEqual([]);
    expect(report?.scripts).toEqual([]);
    expect(questions?.scripts).toEqual([]);
    expect(cost?.scripts).toEqual([]);
    expect(replay?.scripts).toEqual(['replay.js']);
    expect(report?.inlineStyles).toBe(0);
    expect(replay?.inlineStyles).toBe(0);
  });

  it('RNF-003 a key quoted in a card is masked before the page is written', () => {
    const fakeKey = ['sk', `ant-${'x'.repeat(24)}`].join('-');
    const leaky = siteOf([{ ...plainCard, title: `Key ${fakeKey} in the text` }]);

    for (const name of htmlPages) {
      expect(leaky[name] ?? '').not.toContain(fakeKey);
    }
  });
});

describe('checkPublishedIndex', () => {
  it('RF-800 accepts an index that shows the run id', () => {
    expect(checkPublishedIndex(siteOf()['index.html'] ?? '', runKey)).toEqual({ ok: true });
  });

  it('RF-800 fails an index that does not show the run id (a stale page, from a fixture)', async () => {
    const stale = await readFile(
      fileURLToPath(new URL('../../../fixtures/pages/index-without-run.html', import.meta.url)),
      'utf8',
    );
    const result = checkPublishedIndex(stale, runKey);

    expect(result.ok).toBe(false);
    expect('reason' in result ? result.reason : '').toContain(runKey);
  });

  it('RF-800 fails an empty page', () => {
    expect(checkPublishedIndex('   ', runKey).ok).toBe(false);
  });
});
