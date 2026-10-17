import { describe, expect, it } from 'vitest';
import { checkCitations } from '../../../../src/application/verifier/citation-check.js';
import { assignCardIds, type CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { entry } from '../../../support/code-map-builders.js';
import { flowDraft, screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

// RF-260, RF-261, RF-300, ADR-005: step 1 checks every step of a FLOW card and every validation
// and action of a SCRN card; a bad one is marked and the others are left alone.

const at = '2026-10-12T10:00:00.000Z';
const codeMap = {
  files: [
    entry('src/Orders/Checkout.cs', 10, { lines: 70 }),
    entry('src/Web/Checkout.aspx', 10, { lines: 30 }),
  ],
};

const checkout = 'src/Orders/Checkout.cs';
const step = (text: string, path: string, startLine: number, endLine: number) => ({
  text,
  citations: [{ path, startLine, endLine }],
});

function checked(draft: CardDraft) {
  const cards = assignCardIds([{ agentTaskId: 't', area: 'orders', drafts: [draft] }]);
  if (!cards.ok) throw new Error('fixture');
  return checkCitations(cards.value, codeMap, at).cards[0];
}

describe('citation check of FLOW steps', () => {
  it('RF-260 a step citing a file that is not in the code map is CitationInvalid and the other steps are not', () => {
    const claims = [
      step('The basket is validated.', checkout, 10, 24),
      step('The order is saved.', 'src/Orders/Gone.cs', 30, 48),
      step('The mail is sent.', checkout, 50, 58),
    ];

    const flow = checked(flowDraft({ claims }));

    expect(flow?.claims.map((claim) => claim.status)).toEqual([
      'Proposed',
      'CitationInvalid',
      'Proposed',
    ]);
    expect(flow?.claims[1]?.verdict?.reason).toContain('src/Orders/Gone.cs is not a file');
  });

  it('RF-260 a step citing lines past the end of the right file is CitationInvalid', () => {
    const flow = checked(flowDraft({ claims: [step('The order is saved.', checkout, 60, 99)] }));

    expect(flow?.claims[0]?.status).toBe('CitationInvalid');
    expect(flow?.claims[0]?.verdict?.reason).toContain('ends after the last line of the file (70)');
  });
});

describe('citation check of SCRN validations and actions', () => {
  it('RF-261 a validation citing a missing file is CitationInvalid; the other claims stay Proposed', () => {
    const missing = { path: 'src/Web/Gone.aspx', startLine: 1, endLine: 2 };
    const validations = [{ text: 'Must be an e-mail address.', citations: [missing] }];
    const fields = validScreen.fields.map((field) => ({ ...field, validations }));

    const card = checked(screenDraft({ ...validScreen, fields }));

    expect(card?.claims.map((claim) => claim.status)).toEqual([
      'Proposed',
      'CitationInvalid',
      'Proposed',
      'Proposed',
    ]);
  });

  it('RF-261 the actions are CitationInvalid when the lines the screen cites do not exist', () => {
    const claims = [step('The page is served.', 'src/Web/Gone.aspx', 1, 3)];

    const card = checked({ ...screenDraft({ ...validScreen, fields: [] }), claims });

    expect(card?.claims.map((claim) => claim.status)).toEqual([
      'CitationInvalid',
      'CitationInvalid',
      'CitationInvalid',
    ]);
  });
});
