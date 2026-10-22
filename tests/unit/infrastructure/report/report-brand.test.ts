import { describe, expect, it } from 'vitest';
import { renderPage } from '../../../../src/infrastructure/report/page-shell.js';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { auditHtml } from '../../../support/html-audit.js';

// DEC-161, P1-181: every report page carries the Rosetta icon in its masthead and as its favicon.
// The report folder holds only text files, so the icon is an inline PNG data address (the report
// policy allows `img-src data:`); the name is written next to it, so the icon is decorative.

const page = auditHtml(
  renderPage({ page: 'report', runKey: 'run-1', title: 'Report', main: '<p>x</p>' }),
);

describe('report brand', () => {
  it('DEC-161 shows the icon in the masthead beside the live name, with its size set', () => {
    const icon = page.document.querySelector('header.masthead img');

    expect(icon?.getAttribute('src')).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('width')).toBe('28');
    expect(icon?.getAttribute('height')).toBe('28');
    expect(page.document.querySelector('header.masthead .brand')?.textContent).toBe('Rosetta');
  });

  it('DEC-161 uses the icon as the favicon so the browser asks for no file', () => {
    const favicon = page.document.querySelector('link[rel="icon"]');

    expect(favicon?.getAttribute('type')).toBe('image/png');
    expect(favicon?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
  });

  it('DEC-161 stays inside the report policy: an inline image only, no other address', () => {
    expect(REPORT_CSP).toContain("img-src 'self' data:");
    expect(page.foreignLinks).toEqual([]);
  });
});
