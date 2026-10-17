import { checkCitations } from '../../src/application/verifier/citation-check.js';
import { assignCardIds, type CardDraft } from '../../src/domain/cards/card-ids.js';
import type { Card } from '../../src/domain/cards/card.js';
import { draftOf } from './card-fixtures.js';
import { entry } from './code-map-builders.js';

// RF-260, RF-261, RF-300, RF-301: a FLOW card with one invalid and one unsupported step and a SCRN
// card with a made-up validation and a made-up action, over files of the webforms-csharp fixture.

const home = 'Default.aspx.cs';
const service = 'Services/CatalogService.cs';
const page = 'Catalog/Details.aspx';
const codeBehind = 'Catalog/Details.aspx.cs';

const cite = (path: string, startLine: number, endLine: number) => ({ path, startLine, endLine });

export const homeStep = {
  text: 'The home page binds the grid to the catalogue service.',
  citations: [cite(home, 8, 12)],
};

export const unsupportedStep = {
  text: 'The service lowers the stock of every item shown.',
  citations: [cite(service, 12, 12)],
};

export const flowDraftWithBadSteps: CardDraft = draftOf({
  type: 'FLOW',
  title: 'Browse the catalogue',
  area: '(root)',
  flow: { trigger: 'A visitor opens the home page.', outcome: 'The catalogue is listed.' },
  claims: [
    homeStep,
    {
      text: 'The catalogue service reads the stock table.',
      citations: [cite('Services/Gone.cs', 1, 4)],
    },
    unsupportedStep,
  ],
});

export const screenDraftWithMadeUpClaims: CardDraft = draftOf({
  type: 'SCRN',
  title: 'Item details',
  area: 'Catalog',
  screen: {
    route: '/Catalog/Details.aspx',
    roles: [],
    fields: [
      {
        name: 'NameLabel',
        inputKind: 'label',
        required: false,
        validations: [
          {
            text: 'The name may not be longer than 50 characters.',
            citations: [cite(codeBehind, 5, 8)],
          },
        ],
      },
    ],
    actions: [{ label: 'Delete', handler: 'DeleteButton_Click' }],
    leadsTo: [],
  },
  claims: [{ text: 'The page shows the item name in a label.', citations: [cite(page, 1, 2)] }],
});

/** The files of the fixture the cards cite, with their line counts. */
const verifyCodeMap = {
  files: [
    entry(home, 10, { lines: 15 }),
    entry(service, 10, { lines: 20 }),
    entry(page, 10, { lines: 2 }),
    entry(codeBehind, 10, { lines: 10 }),
  ],
};

/** The cards with ids and the citation check done, as a run holds them before judgement. */
export function cardsAfterStep1(drafts: readonly CardDraft[], at: string): readonly Card[] {
  const tasks = drafts.map((draft, index) => ({
    agentTaskId: `reader-00${String(index + 1)}`,
    area: draft.area,
    drafts: [draft],
  }));
  const cards = assignCardIds(tasks);
  if (!cards.ok) throw new Error('The fixture cards are invalid.');
  return checkCitations(cards.value, verifyCodeMap, at).cards;
}
