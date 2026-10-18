import { describe, expect, it } from 'vitest';
import { supportedCards, type SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// RF-626, ADR-005: whether a card is a legacy card is decided per kind of detail, not per text. The
// card writer masks the header and each claim text on its own, so a secret-looking route, role,
// link or field name can stop matching its claim. When the card has claims of that kind, an item
// without a Supported claim of its own text is dropped, never kept.

const citation = { path: 'src/Orders/Orders.cshtml', startLine: 1, endLine: 4 };
// Built from pieces so no secret-looking literal sits in the file.
const secret = ['tok', 'en=', 'abc123', 'xyz789'].join('');
const route = `/login?${secret}`;
const masked = (text: string) => text.replace(secret, 'token=[MASKED:token]');

type Status = SourceCard['claims'][number]['status'];

function card(
  claims: readonly [string, Status][],
  screen: Partial<NonNullable<SourceCard['screen']>>,
) {
  return {
    ...{ id: 'SCRN-001', type: 'SCRN', title: 'Login', summary: 'S.', area: 'auth' },
    screen: {
      ...{ route, roles: [], fields: [], actions: [], leadsTo: [] },
      ...screen,
    },
    claims: [
      {
        claimId: 'SCRN-001.c1',
        text: 'Login is shown.',
        citations: [citation],
        status: 'Supported',
      },
      ...claims.map(([text, status], index) => ({
        ...{ claimId: `SCRN-001.c${String(index + 2)}`, text, citations: [citation] },
        status,
      })),
    ],
  } satisfies SourceCard;
}

describe('supportedCards: a rejected item whose text was masked is not kept', () => {
  it('RF-626 a rejected route with a secret-looking value is dropped', () => {
    const [kept] = supportedCards([
      card([[masked(`The screen is at the route ${route}`), 'Rejected']], {}),
    ]);

    expect(kept?.screen?.route).toBe('');
  });

  it('RF-626 a rejected link with a secret-looking target is dropped, a supported one is kept', () => {
    const target = `/next?${secret}`;
    const [kept] = supportedCards([
      card(
        [
          [masked(`The screen leads to ${target}`), 'Rejected'],
          ['The screen leads to /home.', 'Supported'],
        ],
        { leadsTo: [target, '/home'] },
      ),
    ]);

    expect(kept?.screen?.leadsTo).toEqual(['/home']);
  });
});

describe('supportedCards: roles, fields and legacy cards with masked text', () => {
  it('RF-626 a role with a secret-looking value and no matching claim is dropped when the card has role claims', () => {
    const role = `Admin ${secret}`;
    const [kept] = supportedCards([
      card(
        [
          [masked(`The role ${role} can open the screen`), 'Rejected'],
          ['The role Staff can open the screen.', 'Supported'],
        ],
        { roles: [role, 'Staff'] },
      ),
    ]);

    expect(kept?.screen?.roles).toEqual(['Staff']);
  });

  it('RF-626 a field whose name was masked and has no matching claim is unsupported, not "not checked", when the card has field claims', () => {
    const name = `Key ${secret}`;
    const [kept] = supportedCards([
      card([[masked(`Field ${name} (text, optional) is on the screen.`), 'Rejected']], {
        fields: [{ name, inputKind: 'text', required: false }],
      }),
    ]);

    expect(kept?.screen).toMatchObject({ fields: [], uncheckedFields: [], unsupportedFields: 1 });
  });

  it('RF-626 a card with no claim of a kind keeps its items of that kind (legacy)', () => {
    const [kept] = supportedCards([
      card([['The screen leads to /home.', 'Supported']], {
        roles: ['Staff'],
        leadsTo: ['/home'],
      }),
    ]);

    expect(kept?.screen?.route).toBe(route);
    expect(kept?.screen?.roles).toEqual(['Staff']);
  });
});
