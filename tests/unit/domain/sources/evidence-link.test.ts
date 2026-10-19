import { describe, expect, it } from 'vitest';
import {
  evidenceAnchor,
  evidenceHref,
  evidencePageName,
} from '../../../../src/domain/sources/evidence-link.js';
import { citationHref } from '../../../../web/src/lib/live-run/claim-links.js';
import { cardPageName } from '../../../../src/infrastructure/report/site/page-names.js';

// RF-131: the link of a citation of an uploaded project is built by one rule in the domain; the
// run page (which cannot import the domain) repeats it, and these tests keep the two the same.

const citation = { path: 'Orders/Shipping.cs', startLine: 10, endLine: 12 };
const spot = { cardId: 'BR-001', claimId: 'BR-001.c1' };

describe('evidenceAnchor', () => {
  it('RF-131 names the claim and the citation, with only letters, digits, - and _ left as they are', () => {
    expect(evidenceAnchor('BR-001.c1', citation)).toBe(
      'BR-001%2Ec1:Orders%2FShipping%2Ecs%3A10-12',
    );
  });

  it('RF-131 writes every mark that encodeURIComponent leaves alone as %XX', () => {
    const anchor = evidenceAnchor('c', { ...citation, path: "a!b'c(d)e*f~g.cs" });

    expect(anchor).toBe('c:a%21b%27c%28d%29e%2Af%7Eg%2Ecs%3A10-12');
    expect(anchor).toMatch(/^[A-Za-z0-9%:_-]+$/u);
  });

  it('RF-131 gives no anchor for a path outside the project or lines that are not a range', () => {
    expect(evidenceAnchor('c', { ...citation, path: '../x.cs' })).toBeUndefined();
    expect(evidenceAnchor('c', { ...citation, path: '/x.cs' })).toBeUndefined();
    expect(evidenceAnchor('c', { ...citation, startLine: 0 })).toBeUndefined();
    expect(evidenceAnchor('c', { ...citation, startLine: 5, endLine: 4 })).toBeUndefined();
    expect(evidenceAnchor('c', { ...citation, endLine: 1.5 })).toBeUndefined();
  });
});

describe('evidenceHref', () => {
  it('RF-131 puts the base of the document before the page of the card', () => {
    expect(evidenceHref('../../report/', spot, citation)).toBe(
      '../../report/card-BR-001.html#BR-001%2Ec1:Orders%2FShipping%2Ecs%3A10-12',
    );
    expect(evidenceHref('', spot, citation)).toMatch(/^card-BR-001\.html#/u);
  });

  it('RF-131 opens the card page when the citation is not in a claim', () => {
    expect(evidenceHref('report/', { cardId: 'SCRN-002' }, citation)).toBe(
      'report/card-SCRN-002.html',
    );
  });

  it('RF-131 builds no link for a citation that cannot be opened', () => {
    expect(evidenceHref('', spot, { ...citation, path: 'a/../b.cs' })).toBeUndefined();
    expect(evidenceHref('', { cardId: 'BR-001' }, { ...citation, endLine: 2 })).toBeUndefined();
  });

  it('RF-131 names the same page file as the report writer', () => {
    for (const id of ['BR-001', 'FLOW-012', 'ENT-100']) {
      expect(evidencePageName(id)).toBe(cardPageName(id));
    }
  });
});

describe('the run page and the domain', () => {
  const upload = {
    kind: 'upload',
    fileName: 'a.zip',
    uploadedAt: undefined,
    snapshotHash: undefined,
    runId: 'run-1',
  } as const;

  it.each([
    'Orders/Shipping.cs',
    'Pedidos nuevos/Envío (1).cs',
    "a!b'c(d)e*f~g.cs",
    'x#y?z&w=1/100%.cs',
    '日本語/ファイル.cs',
  ])('RF-131 writes the same address for %s', (path) => {
    const cited = { path, startLine: 3, endLine: 9 };

    const href = citationHref(upload, cited, spot);

    expect(href).toBe(`/runs/run-1/files/report/${evidenceHref('', spot, cited) ?? ''}`);
  });
});
