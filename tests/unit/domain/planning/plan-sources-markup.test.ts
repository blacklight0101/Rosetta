import { describe, expect, it } from 'vitest';
import { supportedCards, type SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// P5-31, RF-626, ADR-005: the plan keeps a button, a link and a target the way the claims of a page
// with markup state them ("<text> starts <handler>", "<text> links to <target>").

const citation = { path: 'Web/Contact.aspx', startLine: 5, endLine: 5 };
type Status = SourceCard['claims'][number]['status'];

function card(claims: readonly [string, Status][], screen: Partial<SourceCard['screen']>) {
  return {
    ...{ id: 'SCRN-001', type: 'SCRN', title: 'Contact', summary: 'S.', area: 'web' },
    screen: { ...{ route: '/x', roles: [], fields: [], actions: [], leadsTo: [] }, ...screen },
    claims: claims.map(([text, status], index) => ({
      ...{ claimId: `SCRN-001.c${String(index + 1)}`, text, citations: [citation] },
      status,
    })),
  } satisfies SourceCard;
}

describe('P5-31 supportedCards with the claims of a page with markup', () => {
  it('P5-31 keeps a button and a link whose markup claim is Supported, drops the others', () => {
    const [kept] = supportedCards([
      card(
        [
          ['Save starts btnSave_Click.', 'Supported'],
          ['Email support links to mailto:help@example.test.', 'Supported'],
          ['Print starts Print_Click.', 'Rejected'],
        ],
        {
          actions: [
            { label: 'Save', handler: 'btnSave_Click' },
            { label: 'Email support', handler: 'mailto:help@example.test' },
            { label: 'Print', handler: 'Print_Click' },
          ],
        },
      ),
    ]);

    expect(kept?.screen?.actions.map((action) => action.label)).toEqual(['Save', 'Email support']);
  });

  it('P5-31 keeps a target a Supported link claim states and drops one a rejected link states', () => {
    const [kept] = supportedCards([
      card(
        [
          ['Home links to /home.', 'Supported'],
          ['Away links to /away.', 'Rejected'],
        ],
        { leadsTo: ['/home', '/away'] },
      ),
    ]);

    expect(kept?.screen?.leadsTo).toEqual(['/home']);
  });
});
