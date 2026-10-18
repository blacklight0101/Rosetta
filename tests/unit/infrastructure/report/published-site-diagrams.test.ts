import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  buildSiteFiles,
  type ReportSiteAssets,
} from '../../../../src/infrastructure/report/published-site.js';
import { auditHtml } from '../../../support/html-audit.js';
import { reportModel } from '../../../support/report-fixtures.js';

// RF-508, RF-501, RF-800: the published site draws the diagrams too, from files beside the pages,
// so it works on GitHub Pages under a sub-path; a site without diagrams has none of those files.

const diagrams = {
  'diagrams.js': 'void 0;',
  'mermaid.min.js': 'void 1;',
  'mermaid.LICENSE.txt': 'MIT License',
} as const;
const assets: ReportSiteAssets = { 'report.css': 'body {}', 'replay.js': 'void 0;', diagrams };
const diagram = { document: 'spec.md', title: 'Screens', source: 'flowchart LR\n  s1["Home"]' };
const masker = new SecretMasker();

describe('buildSiteFiles and the diagrams', () => {
  it('RF-508 adds the diagrams page and its three files to a site whose run has diagrams', () => {
    const files = buildSiteFiles(reportModel({ diagrams: [diagram] }), assets, masker, {});

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'diagrams.html',
        'diagrams.js',
        'mermaid.min.js',
        'mermaid.LICENSE.txt',
      ]),
    );
    expect(files['mermaid.min.js']).toBe('void 1;');
  });

  it('RF-501 RF-508 gives the diagrams page relative addresses only, so a sub-path serves it', () => {
    const files = buildSiteFiles(reportModel({ diagrams: [diagram] }), assets, masker, {});

    const audit = auditHtml(files['diagrams.html'] ?? '');
    expect(audit.scripts).toEqual(['mermaid.min.js', 'diagrams.js']);
    expect(audit.document.querySelector('link[rel=stylesheet]')?.getAttribute('href')).toBe(
      'report.css',
    );
    expect(files['diagrams.html']).not.toMatch(/(href|src)="(\/|https?:)/u);
    expect(files['diagrams.html']).not.toContain('href="../');
  });

  it('RF-508 links the page from the published dashboard', () => {
    const files = buildSiteFiles(reportModel({ diagrams: [diagram] }), assets, masker, {});

    expect(files['report.html']).toContain('href="diagrams.html"');
  });

  it('RF-508 adds nothing for a site whose run has no diagram, or when no build is given', () => {
    const none = buildSiteFiles(reportModel(), assets, masker, {});
    const unbuilt = buildSiteFiles(
      reportModel({ diagrams: [diagram] }),
      { 'report.css': 'body {}', 'replay.js': 'void 0;' },
      masker,
      {},
    );

    for (const files of [none, unbuilt]) {
      expect(Object.keys(files).filter((name) => /diagrams|mermaid/u.test(name))).toEqual([]);
    }
    expect(unbuilt['report.html']).not.toContain('diagrams.html');
  });
});
