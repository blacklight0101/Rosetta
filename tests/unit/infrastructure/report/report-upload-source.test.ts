import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { buildSiteFiles } from '../../../../src/infrastructure/report/published-site.js';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { renderEvidencePages } from '../../../../src/infrastructure/report/site/evidence-pages.js';
import { renderDiagramsPage } from '../../../../src/infrastructure/report/site/diagrams-page.js';
import { cardPageName } from '../../../../src/infrastructure/report/site/page-names.js';
import { auditHtml } from '../../../support/html-audit.js';
import { plainDetail, reportModel } from '../../../support/report-fixtures.js';
import {
  githubAddress,
  hostileFileName,
  uploadHash,
  uploadReportSource,
} from '../../../support/upload-source-fixtures.js';

// RF-131: the header of the report of an uploaded project names the zip, the upload date and the
// snapshot hash instead of a repository and a commit, and no page of the report points outside
// Rosetta. The report of a GitHub project is not touched (RF-504, RF-125).

const masker = new SecretMasker();
const diagrams = [{ document: 'spec.md', title: 'FLOW-001 Check out', source: 'sequenceDiagram' }];

function uploadModel(fileName: string = uploadReportSource.fileName) {
  return reportModel({
    source: { ...uploadReportSource, fileName },
    cardDetails: [plainDetail],
    diagrams,
  });
}

describe('report.md of an uploaded project', () => {
  it('RF-131 names the zip, the upload date and the snapshot hash and links no repository', () => {
    const text = renderReportMarkdown(uploadModel(), masker);

    expect(text).toContain(
      `| Source | OrderDesk.zip |\n| Uploaded | 2026-10-19T09:30:00.000Z |\n| Snapshot | ${uploadHash} |\n`,
    );
    expect(text).not.toContain('github.com');
    expect(text).not.toMatch(/\]\(https?:/u);
  });

  it('RF-131 shows a file name that is markup, a link or a table cell as text', () => {
    const text = renderReportMarkdown(uploadModel(hostileFileName), masker);

    const row = text.split('\n').find((line) => line.startsWith('| Source |')) ?? '';
    expect(row).not.toContain('<img');
    expect(row.replaceAll('\\', '')).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(row.replaceAll('\\|', '').split('|')).toHaveLength(4);
    expect(text).not.toMatch(/\]\(javascript:/u);
  });

  it('RF-131 says the zip was not recorded when the manifest holds no name', () => {
    const source = {
      kind: 'upload',
      fileName: null,
      uploadedAt: null,
      snapshotHash: null,
    } as const;

    const text = renderReportMarkdown(reportModel({ source }), masker);

    expect(text).toContain('| Source | An uploaded zip (its name was not recorded) |');
    expect(text).not.toContain('| Uploaded |');
    expect(text).not.toContain('| Snapshot |');
  });

  it('RF-504 keeps the repository row of a GitHub project as it is', () => {
    const text = renderReportMarkdown(reportModel(), masker);

    expect(text).toContain(
      '| Source | [octo/demo @ 3f786850e387](https://github.com/octo/demo/tree/3f786850e387550fdab836ed7e6dc881de23001b) |',
    );
    expect(text).not.toContain('| Uploaded |');
  });
});

describe('report.html of an uploaded project', () => {
  function factsOf(fileName?: string): Record<string, string> {
    const { document } = auditHtml(renderReportHtml(uploadModel(fileName)));
    const rows = [...document.querySelectorAll('dl.facts > div')];
    return Object.fromEntries(
      rows.map((row) => [
        row.querySelector('dt')?.textContent ?? '',
        row.querySelector('dd')?.textContent ?? '',
      ]),
    );
  }

  it('RF-131 names the zip, the upload date and the snapshot hash', () => {
    const facts = factsOf();

    expect(facts['Source']).toBe('OrderDesk.zip');
    expect(facts['Uploaded']).toBe('2026-10-19T09:30:00.000Z');
    expect(facts['Snapshot']).toBe(uploadHash);
  });

  it('RF-131 shows a file name that is markup as text, not as an element or a link', () => {
    const html = renderReportHtml(uploadModel(hostileFileName));
    const { document, handlers, foreignLinks } = auditHtml(html);

    expect(factsOf(hostileFileName)['Source']).toBe(hostileFileName);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(handlers).toEqual([]);
    expect(foreignLinks).toEqual([]);
    expect(html).not.toContain('<img src=x');
  });
});

describe('the header of report.html when the manifest holds little', () => {
  it('RF-131 names only what the manifest holds', () => {
    const source = {
      kind: 'upload',
      fileName: null,
      uploadedAt: null,
      snapshotHash: null,
    } as const;
    const { document } = auditHtml(renderReportHtml(reportModel({ source })));

    const names = [...document.querySelectorAll('dl.facts > div > dt')].map((dt) => dt.textContent);
    expect(names).toContain('Source');
    expect(names).not.toContain('Uploaded');
    expect(names).not.toContain('Snapshot');
    expect(document.querySelector('dl.facts')?.textContent).toContain(
      'An uploaded zip (its name was not recorded)',
    );
  });

  it('RF-131 links the zip nowhere', () => {
    const { document } = auditHtml(renderReportHtml(uploadModel()));

    const source = [...document.querySelectorAll('dl.facts > div')].find(
      (row) => row.querySelector('dt')?.textContent === 'Source',
    );
    expect(source?.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('every page of the report of an uploaded project', () => {
  const assets = { 'report.css': 'body {}', 'replay.js': 'void 0;', 'filters.js': 'void 1;' };

  it('RF-131 holds no github.com address and no link outside Rosetta', () => {
    const files = buildSiteFiles(uploadModel(), assets, masker, {});
    const pages = Object.entries(files).filter(([name]) => name.endsWith('.html'));

    expect(pages.length).toBeGreaterThan(5);
    const withGithub = pages.filter(([, html]) => githubAddress.test(html)).map(([n]) => n);
    const withForeign = pages
      .filter(([, html]) => auditHtml(html).foreignLinks.length > 0)
      .map(([name]) => name);
    expect(withGithub).toEqual([]);
    expect(withForeign).toEqual([]);
    expect(files['report.md']).not.toMatch(githubAddress);
  });

  it('RF-131 holds none in the diagrams page either', () => {
    const html = renderDiagramsPage(uploadModel());

    expect(html).not.toContain('github.com');
    expect(auditHtml(html).foreignLinks).toEqual([]);
  });
});

describe('the evidence page of an uploaded project', () => {
  function pageOf(path = 'Orders/Shipping.cs') {
    const [first, second] = plainDetail.claims;
    const cited = first?.citations[0];
    if (first === undefined || second === undefined || cited === undefined) {
      throw new Error('fixture');
    }
    const detail = {
      ...plainDetail,
      claims: [{ ...first, citations: [{ ...cited, path }] }, second],
    };
    const model = reportModel({ source: uploadReportSource, cardDetails: [detail] });
    const html = renderEvidencePages(model)[cardPageName(detail.id)] ?? '';
    return { html, ...auditHtml(html) };
  }

  const links = (page: ReturnType<typeof pageOf>): (string | null)[] =>
    [...page.document.querySelectorAll('a.permalink')].map((a) => a.getAttribute('href'));
  const ids = (page: ReturnType<typeof pageOf>): (string | null)[] =>
    [...page.document.querySelectorAll('li.citation')].map((li) => li.getAttribute('id'));

  it('RF-131 links each citation to its own lines on the page, not to GitHub', () => {
    const page = pageOf();

    expect(links(page)).toEqual([
      '#BR-001%2Ec1:Orders%2FShipping%2Ecs%3A10-12',
      '#BR-001%2Ec2:Orders%2FGifts%2Ecs%3A1-2',
    ]);
    expect(ids(page)).toEqual(links(page).map((link) => link?.slice(1)));
    expect(page.html).not.toContain('github.com');
    expect(page.html).not.toContain('View on GitHub');
  });

  it('RF-131 opens the right lines for a path with spaces and non-ASCII characters', () => {
    const page = pageOf('Pedidos nuevos/Envío (1).cs');

    expect(links(page)[0]).toBe(
      '#BR-001%2Ec1:Pedidos%20nuevos%2FEnv%C3%ADo%20%281%29%2Ecs%3A10-12',
    );
    expect(ids(page)[0]).toBe(links(page)[0]?.slice(1));
  });

  it('RF-131 builds no link for a path that leaves the project', () => {
    const page = pageOf('../../etc/passwd');

    expect(links(page)).toEqual(['#BR-001%2Ec2:Orders%2FGifts%2Ecs%3A1-2']);
  });
});
