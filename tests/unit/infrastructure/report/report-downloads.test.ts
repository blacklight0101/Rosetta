import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { auditHtml } from '../../../support/html-audit.js';
import { reportModel } from '../../../support/report-fixtures.js';

// RF-505, RNF-010: the dashboard links "Download all", relative links that work from disk and
// under a sub-path, marked as downloads; the hand-off link only when the model names that zip.

type Overrides = Parameters<typeof reportModel>[0];

function linksOf(overrides: Overrides): { name: string; href: string | null; download: boolean }[] {
  const page = auditHtml(renderReportHtml(reportModel(overrides)));
  return [...page.document.querySelectorAll('section#downloads-section a')].map((link) => ({
    name: link.textContent.trim(),
    href: link.getAttribute('href'),
    download: link.hasAttribute('download'),
  }));
}

describe('the dashboard downloads', () => {
  it('RF-505 links the zip of the run, as a download, with a relative address', () => {
    const links = linksOf({ downloads: { run: '20261012-100000-understand.zip' } });

    expect(links).toEqual([
      {
        name: 'Download all: the run as a zip',
        href: '20261012-100000-understand.zip',
        download: true,
      },
    ]);
  });

  it('RF-505 links the hand-off zip too when the report names one', () => {
    const links = linksOf({
      downloads: { run: 'r.zip', handoff: 'r-handoff.zip' },
    });

    expect(links.map((link) => link.href)).toEqual(['r.zip', 'r-handoff.zip']);
    expect(links[1]).toMatchObject({
      name: 'Download the hand-off package as a zip',
      download: true,
    });
  });

  it('RF-505 shows no downloads section for a report written without zips', () => {
    expect(linksOf({ downloads: undefined })).toEqual([]);
    const page = auditHtml(renderReportHtml(reportModel({ downloads: undefined })));
    expect(page.document.querySelector('#downloads-section')).toBeNull();
  });

  it('RF-505 puts the section under a heading of its own so a reader can reach it', () => {
    const page = auditHtml(renderReportHtml(reportModel({ downloads: { run: 'r.zip' } })));

    expect(page.document.querySelector('#downloads-section h2')?.textContent).toBe('Download all');
  });
});
