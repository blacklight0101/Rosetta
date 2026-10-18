import { describe, expect, it } from 'vitest';
import { renderDiagramsPage } from '../../../../src/infrastructure/report/site/diagrams-page.js';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { auditHtml } from '../../../support/html-audit.js';
import { reportModel } from '../../../support/report-fixtures.js';

// RF-508, RF-507, RF-1013: the page that draws the diagrams of the run. It holds every diagram's
// source as text, with a note nobody sees until the script cannot draw it; the vendored Mermaid
// build and the loader are files of the report folder, so the policy needs no inline allowance.

const flow = {
  document: 'spec.md',
  title: 'FLOW-001 Check out',
  source: 'sequenceDiagram\n  participant p1 as Cart\n  p1->>p1: 1. Pay',
};
const hostile = {
  document: 'spec.md',
  title: '<img src=x onerror="window.__pwned=1">',
  source:
    'flowchart LR\n  a["<script>window.__pwned=1</script>"]\n  click a "javascript:window.__pwned=1"',
};

const pageOf = (diagrams = [flow, hostile]): string =>
  renderDiagramsPage(reportModel({ diagrams }));

describe('the diagrams page', () => {
  it('RF-508 shows each diagram as a figure that holds its source as text', () => {
    const { document } = auditHtml(pageOf());

    const figures = [...document.querySelectorAll('figure[data-diagram]')];
    expect(figures).toHaveLength(2);
    expect(figures[0]?.querySelector('pre')?.textContent).toBe(flow.source);
    expect(figures[0]?.querySelector('figcaption')?.textContent).toContain('FLOW-001 Check out');
    expect(figures[0]?.querySelector('figcaption')?.textContent).toContain('spec.md');
  });

  it('RF-508 keeps the note hidden and the source open until the script has drawn the diagram', () => {
    const { document } = auditHtml(pageOf([flow]));

    const figure = document.querySelector('figure[data-diagram]');
    expect(figure?.querySelector('[data-diagram-note]')?.hasAttribute('hidden')).toBe(true);
    expect(figure?.querySelector('[data-diagram-note]')?.textContent).toContain(
      'could not be drawn',
    );
    expect(figure?.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(figure?.querySelector('[data-diagram-drawing]')?.children).toHaveLength(0);
  });

  it('RF-507 RF-508 shows a hostile title and source as text: nothing in the page can run', () => {
    const html = pageOf();
    const audit = auditHtml(html);

    expect(audit.handlers).toEqual([]);
    expect(audit.foreignLinks).toEqual([]);
    expect(audit.inlineStyles).toBe(0);
    expect(audit.styleElements).toBe(0);
    expect(audit.scripts).toEqual(['mermaid.min.js', 'diagrams.js']);
    expect(audit.document.querySelectorAll('img, svg, a[href^="javascript"]')).toHaveLength(0);
    expect(audit.document.querySelectorAll('figure pre')[1]?.textContent).toBe(hostile.source);
    expect(audit.document.querySelectorAll('figcaption')[1]?.textContent).toContain(hostile.title);
  });
});

describe('the diagrams page files and links', () => {
  it('RF-1013 carries the policy of every report page and loads the build and the loader in that order', () => {
    const audit = auditHtml(pageOf());

    expect(audit.csp).toBe(REPORT_CSP);
    expect(audit.csp).not.toContain('unsafe');
    expect(audit.referrer).toBe('no-referrer');
    expect(audit.document.querySelectorAll('script[defer]')).toHaveLength(2);
  });

  it('RF-508 names the Mermaid version and links its licence, which ships with the build', () => {
    const { document } = auditHtml(pageOf());

    const licence = document.querySelector('a[href="mermaid.LICENSE.txt"]');
    expect(licence?.textContent).toContain('licence');
    expect(document.querySelector('main')?.textContent).toContain('Mermaid 12.2.0');
  });

  it('RF-508 links the page from the dashboard only when the run has diagrams', () => {
    const withDiagrams = auditHtml(renderReportHtml(reportModel({ diagrams: [flow] }))).document;
    const without = auditHtml(renderReportHtml(reportModel())).document;

    expect(withDiagrams.querySelector('a[href="diagrams.html"]')?.textContent).toBe('Diagrams');
    expect(without.querySelector('a[href="diagrams.html"]')).toBeNull();
  });
});
