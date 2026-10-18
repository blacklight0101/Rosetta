import type { ReportCardDetail, ReportClaim } from '../../src/application/report/card-detail.js';
import { renderCardPage } from '../../src/infrastructure/report/site/card-page.js';
import { auditHtml, type HtmlAudit } from './html-audit.js';
import { plainDetail, reportModel, shippingCitation } from './report-fixtures.js';

// RF-502: helpers of the tests of the page of a card.

export const commit = '3f786850e387550fdab836ed7e6dc881de23001b';

export type Overrides = Parameters<typeof reportModel>[0];

export function pageOf(card: ReportCardDetail = plainDetail, overrides: Overrides = {}): HtmlAudit {
  const model = reportModel({ cardDetails: [card], ...overrides });
  return auditHtml(renderCardPage(model, card));
}

export const textsOf = (page: HtmlAudit, selector: string): string[] =>
  [...page.document.querySelectorAll(selector)].map((item) => item.textContent.trim());

export const hrefsOf = (page: HtmlAudit, selector: string): (string | null)[] =>
  [...page.document.querySelectorAll(selector)].map((item) => item.getAttribute('href'));

/** The card with one claim of this shape. */
export function withClaim(claim: Partial<ReportClaim>): ReportCardDetail {
  return {
    ...plainDetail,
    claims: [
      {
        claimId: 'BR-001.c1',
        text: 'A claim.',
        status: 'Supported',
        citations: [shippingCitation],
        ...claim,
      },
    ],
  };
}
