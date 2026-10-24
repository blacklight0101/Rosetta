import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import type { ReportCardDetail } from '../../../../src/application/report/card-detail.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { buildSiteFiles } from '../../../../src/infrastructure/report/published-site.js';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { renderEvidencePages } from '../../../../src/infrastructure/report/site/evidence-pages.js';
import { cardPageName } from '../../../../src/infrastructure/report/site/page-names.js';
import { auditHtml } from '../../../support/html-audit.js';
import { plainDetail, reportModel } from '../../../support/report-fixtures.js';
import {
  githubAddress,
  uploadReportSource,
  workbookHash,
  workbookReportSource,
} from '../../../support/upload-source-fixtures.js';

// RF-156: the header of the report of a workbook project names the workbooks, the upload date and
// the snapshot hash instead of a repository and a commit; every citation opens the evidence page and
// shows the workbook, the sheet and the cells; no page points outside Rosetta.

const masker = new SecretMasker();
const hostileName = '<img src=x onerror=alert(1)> **b** [x](javascript:alert(1)) | y.xlsx';

function workbookModel(workbooks: readonly string[] = workbookReportSource.workbooks) {
  return reportModel({
    source: { ...workbookReportSource, workbooks },
    cardDetails: [plainDetail],
  });
}

describe('report.md of a workbook project', () => {
  it('RF-156 names the workbooks, the upload date and the snapshot hash and links no repository', () => {
    const text = renderReportMarkdown(workbookModel(), masker);

    expect(text).toContain(
      `| Source | Excel workbooks: Pricing.xlsx, Rates.xlsm |\n| Uploaded | 2026-10-19T09:30:00.000Z |\n| Snapshot | ${workbookHash} |\n`,
    );
    expect(text).not.toContain('github.com');
    expect(text).not.toMatch(/\]\(https?:/u);
  });

  it('RF-156 shows a workbook name that is markup, a link or a table cell as text', () => {
    const text = renderReportMarkdown(workbookModel([hostileName]), masker);

    const row = text.split('\n').find((line) => line.startsWith('| Source |')) ?? '';
    expect(dangerousIn(row)).toBeUndefined();
    expect(row).toContain('\\<img src=x onerror=alert(1)>');
    expect(row.replaceAll('\\|', '').split('|')).toHaveLength(4);
  });

  it('RF-156 says the names were not recorded when the manifest holds none', () => {
    const text = renderReportMarkdown(workbookModel([]), masker);

    expect(text).toContain('| Source | Excel workbooks (their names were not recorded) |');
  });

  it('RF-131 keeps the zip row of an upload as it is', () => {
    const text = renderReportMarkdown(reportModel({ source: uploadReportSource }), masker);

    expect(text).toContain('| Source | OrderDesk.zip |');
    expect(text).not.toContain('Excel workbooks');
  });
});

describe('report.html of a workbook project', () => {
  function factsOf(workbooks?: readonly string[]): Record<string, string> {
    const { document } = auditHtml(renderReportHtml(workbookModel(workbooks)));
    return Object.fromEntries(
      [...document.querySelectorAll('dl.facts > div')].map((row) => [
        row.querySelector('dt')?.textContent ?? '',
        row.querySelector('dd')?.textContent ?? '',
      ]),
    );
  }

  it('RF-156 names the workbooks, the upload date and the snapshot hash', () => {
    const facts = factsOf();

    expect(facts['Source']).toBe('Excel workbooks: Pricing.xlsx, Rates.xlsm');
    expect(facts['Uploaded']).toBe('2026-10-19T09:30:00.000Z');
    expect(facts['Snapshot']).toBe(workbookHash);
  });

  it('RF-156 shows a workbook name that is markup as text, not as an element or a link', () => {
    const html = renderReportHtml(workbookModel([hostileName]));
    const { document, handlers, foreignLinks } = auditHtml(html);

    expect(factsOf([hostileName])['Source']).toBe(`Excel workbooks: ${hostileName}`);
    expect(document.querySelectorAll('main img')).toHaveLength(0);
    expect(handlers).toEqual([]);
    expect(foreignLinks).toEqual([]);
  });

  it('RF-156 says the names were not recorded when the manifest holds none', () => {
    expect(factsOf([])['Source']).toBe('Excel workbooks (their names were not recorded)');
  });
});

describe('every page of the report of a workbook project', () => {
  const assets = { 'report.css': 'body {}', 'replay.js': 'void 0;', 'filters.js': 'void 1;' };

  it('RF-156 holds no github.com address and no link outside Rosetta', () => {
    const files = buildSiteFiles(workbookModel(), assets, masker, {});
    const pages = Object.entries(files).filter(([name]) => name.endsWith('.html'));

    expect(pages.length).toBeGreaterThan(5);
    const withGithub = pages.filter(([, html]) => githubAddress.test(html)).map(([n]) => n);
    const withForeign = pages
      .filter(([, html]) => auditHtml(html).foreignLinks.length > 0)
      .map(([name]) => name);
    expect(withGithub).toEqual([]);
    expect(withForeign).toEqual([]);
    expect(files['report.md']).not.toMatch(githubAddress);
    expect(Object.values(files).join('\n')).not.toContain('View on GitHub');
  });
});

function detailCiting(
  path: string,
  startLine: number,
  endLine: number,
  lines: readonly string[],
): ReportCardDetail {
  return {
    ...plainDetail,
    claims: [
      {
        claimId: 'BR-001.c1',
        text: 'A rule.',
        status: 'Supported',
        citations: [{ path, startLine, endLine, excerpt: { kind: 'lines', firstLine: 1, lines } }],
      },
    ],
  };
}

const formulaLines = [
  '## Region B2:B40 (39 formulas)',
  'B12 = IF(C12>1000, C12*0.95, C12)    [cached: 950]',
  'B13 = IF(C13>1000, C13*0.95, C13)    [cached: 1200]',
  '## Region D2:D4001 (shared formula, 4000 cells)',
  'D2:D4001 = B2*C4    [written for D2; cached D2: 110.5]',
];

function pageOf(source: ReturnType<typeof reportModel>['source'], detail: ReportCardDetail) {
  const pages = renderEvidencePages(reportModel({ source, cardDetails: [detail] }));
  const html = pages[cardPageName(detail.id)] ?? '';
  return { html, ...auditHtml(html) };
}

const labels = (page: ReturnType<typeof pageOf>): string[] =>
  [...page.document.querySelectorAll('.citation-label')].map((each) => each.textContent);
const hrefs = (page: ReturnType<typeof pageOf>): (string | null)[] =>
  [...page.document.querySelectorAll('a.permalink')].map((a) => a.getAttribute('href'));

describe('the evidence page of a workbook project', () => {
  it('RF-156 links the citation to its own lines on the page, not to GitHub', () => {
    const page = pageOf(
      workbookReportSource,
      detailCiting('Pricing.xlsx/Summary/formulas.md', 2, 3, formulaLines),
    );

    expect(hrefs(page)).toEqual(['#BR-001%2Ec1:Pricing%2Exlsx%2FSummary%2Fformulas%2Emd%3A2-3']);
    expect(page.html).not.toContain('github.com');
    expect(page.html).not.toContain('View on GitHub');
  });

  it('RF-156 shows the workbook, the sheet and the cells beside the citation', () => {
    const page = pageOf(
      workbookReportSource,
      detailCiting('Pricing.xlsx/Summary/formulas.md', 2, 3, formulaLines),
    );

    expect(labels(page)).toEqual(['Pricing.xlsx, sheet Summary, cells B12, B13']);
  });

  it('RF-156 reads a citation across a region heading from the lines that carry cells', () => {
    const page = pageOf(
      workbookReportSource,
      detailCiting('Pricing.xlsx/Summary/formulas.md', 3, 5, formulaLines),
    );

    expect(labels(page)).toEqual(['Pricing.xlsx, sheet Summary, cells B13, D2:D4001']);
  });
});

describe('the evidence page of a workbook project, files without cells', () => {
  it.each(['dependencies.md', 'Pricing.xlsx/workbook.md', 'Pricing.xlsx/macros/Module1.bas'])(
    'RF-156 shows no label beside a citation to %s but still links it',
    (path) => {
      const page = pageOf(workbookReportSource, detailCiting(path, 1, 2, ['A1 = 2', 'B1 = 3']));

      expect(labels(page)).toEqual([]);
      expect(hrefs(page)).toHaveLength(1);
    },
  );

  it('RF-156 shows the label of a workbook that a zip held, under the zip header', () => {
    const page = pageOf(
      uploadReportSource,
      detailCiting('finance/Budget.xlsm/Plan/formulas.md', 1, 1, ['A1 = B1+1    [cached: 2]']),
    );

    expect(labels(page)).toEqual(['Budget.xlsm, sheet Plan, cells A1']);
  });

  it('RF-131 shows no label beside a citation of a zip without workbooks', () => {
    const page = pageOf(uploadReportSource, detailCiting('docs/formulas.md', 1, 1, ['A1 = B1+1']));

    expect(labels(page)).toEqual([]);
  });

  it('RF-125 shows no label and keeps the GitHub link on a GitHub project', () => {
    const page = pageOf(
      reportModel().source,
      detailCiting('Pricing.xlsx/Summary/formulas.md', 2, 3, formulaLines),
    );

    expect(labels(page)).toEqual([]);
    expect(page.html).toContain('View on GitHub');
  });
});
