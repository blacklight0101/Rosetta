import { describe, expect, it } from 'vitest';
import { sectionsOf, type OverviewDraft } from '../../../../src/domain/overview/build-overview.js';
import { eligibleCards } from '../../../../src/domain/overview/eligible-cards.js';
import { questionLinks } from '../../../../src/domain/overview/question-links.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { notCoveredOf } from '../../../../src/domain/overview/standing.js';
import { isChosenRun, isThin, thinNotice } from '../../../../src/domain/overview/thin-run.js';
import { fullOverview, overviewCards, withStatus } from '../../../support/app-overview-fixtures.js';

// RF-264: the rules of the overview that need no model: which cards it may use, which statements
// it keeps, how thin a run is, what was not covered and which section a question concerns.

const none: OverviewDraft = {
  application: [],
  users: [],
  features: [],
  screens: [],
  data: [],
  integrations: [],
};

describe('eligibleCards', () => {
  it('RF-264 uses the cards whose citations passed and leaves out open questions', () => {
    const ids = eligibleCards(overviewCards()).map((card) => card.id);

    expect(ids).toEqual(['FEAT-001', 'ENT-001', 'FEAT-002', 'ENT-002']);
  });

  it('RF-264 leaves out a card whose claims all failed the citation check or were rejected', () => {
    const invalid = withStatus(overviewCards(), ['FEAT-001'], 'CitationInvalid');
    const cards = withStatus(invalid, ['ENT-002'], 'Rejected');

    expect(eligibleCards(cards).map((card) => card.id)).toEqual(['ENT-001', 'FEAT-002']);
  });

  it('RF-264 keeps a card judged Supported or left Unverified', () => {
    const supported = withStatus(overviewCards(), ['FEAT-001'], 'Supported');
    const cards = withStatus(supported, ['ENT-001'], 'Unverified');

    expect(eligibleCards(cards)).toHaveLength(4);
  });
});

const shown = eligibleCards(overviewCards());

describe('sectionsOf', () => {
  it('RF-264 drops a statement that links no card and counts it', () => {
    const draft = {
      ...none,
      features: [
        { text: 'Orders are placed.', cards: ['FEAT-001'] },
        { text: 'It probably sends mail.', cards: [] },
      ],
    };

    const built = sectionsOf(draft, shown);

    expect(built.sections).toEqual([
      {
        id: 'features',
        statements: [{ text: 'Orders are placed.', cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
      },
    ]);
    expect(built.dropped).toBe(1);
  });
});

describe('sectionsOf and the cards it keeps', () => {
  it('RF-264 drops a statement whose only cards the summariser was not shown', () => {
    const draft = { ...none, data: [{ text: 'A ledger.', cards: ['ENT-999', 'OQ-001'] }] };

    const built = sectionsOf(draft, shown);

    expect(built.sections).toEqual([]);
    expect(built.dropped).toBe(1);
  });

  it('RF-264 keeps a statement with a shown card and sheds the invented ones', () => {
    const draft = {
      ...none,
      users: [{ text: 'Staff.', cards: ['ENT-999', 'ENT-001', 'ENT-001'] }],
    };

    const built = sectionsOf(draft, shown);

    expect(built.sections[0]?.statements[0]?.cards).toEqual([{ id: 'ENT-001', type: 'ENT' }]);
  });

  it('RF-264 drops a statement with no text and keeps the sections in their fixed order', () => {
    const draft = {
      ...none,
      integrations: [{ text: 'A bank.', cards: ['FEAT-002'] }],
      application: [
        { text: '   ', cards: ['FEAT-001'] },
        { text: 'A shop.', cards: ['FEAT-001'] },
      ],
    };

    const built = sectionsOf(draft, shown);

    expect(built.sections.map((section) => section.id)).toEqual(['application', 'integrations']);
    expect(built.dropped).toBe(1);
  });
});

describe('isThin and thinNotice', () => {
  const reach = { cards: 6, areas: 4, areasWithCards: 3, thirdPartyAreas: 0, found: 4, chosen: 4 };

  it('RF-264 a run with enough cards from enough areas is not thin', () => {
    expect(isThin(reach)).toBe(false);
  });

  it('RF-264 a run with exactly three cards is not thin and one with two is', () => {
    expect(isThin({ ...reach, cards: 3 })).toBe(false);
    expect(isThin({ ...reach, cards: 2 })).toBe(true);
  });

  it('RF-264 a run with fewer than three cards is thin', () => {
    expect(isThin({ ...reach, cards: 2 })).toBe(true);
  });

  it('RF-264 a run whose cards come from fewer than half of the areas is thin', () => {
    expect(isThin({ ...reach, areasWithCards: 1 })).toBe(true);
    expect(isThin({ ...reach, areasWithCards: 2 })).toBe(false);
  });

  it('RF-264 says the run cannot explain the application and names the next step', () => {
    const notice = thinNotice({
      cards: 1,
      areas: 4,
      areasWithCards: 1,
      thirdPartyAreas: 1,
      found: 4,
      chosen: 3,
    });

    expect(notice).toContain('cannot explain the application yet');
    expect(notice).toContain('Next step');
    expect(notice).toContain('Only 1 card from 1 of 4 areas passed the citation check.');
    expect(notice).not.toMatch(/\(s\)/u);
  });

  it('RF-264 says most areas are third-party code when they are', () => {
    const notice = thinNotice({
      cards: 0,
      areas: 4,
      areasWithCards: 0,
      thirdPartyAreas: 3,
      found: 4,
      chosen: 1,
    });

    expect(notice).toContain('Most areas of this repository hold third-party code');
  });
});

describe('thinNotice wording (Q-49)', () => {
  it.each([
    [0, 2, 0, 'No card from 2 areas passed the citation check.'],
    [0, 1, 0, 'No card from 1 area passed the citation check.'],
    [1, 2, 1, 'Only 1 card from 1 of 2 areas passed the citation check.'],
    [2, 4, 1, 'Only 2 cards from 1 of 4 areas passed the citation check.'],
    [1, 1, 1, 'Only 1 card from 1 area passed the citation check.'],
    [2, 1, 1, 'Only 2 cards from 1 area passed the citation check.'],
    [0, 0, 0, 'No area was read, so no card passed the citation check.'],
  ])(
    'RF-231 words %i cards from %i areas (%i with a card) as a sentence, never "card(s)"',
    (cards, areas, areasWithCards, sentence) => {
      const reach = { cards, areas, areasWithCards, thirdPartyAreas: 0, found: areas, chosen: 0 };

      const notice = thinNotice(reach);

      expect(notice).toContain(sentence);
      expect(notice).not.toMatch(/\(s\)/u);
    },
  );
});

describe('isChosenRun', () => {
  const run = { cards: 6, areas: 3, areasWithCards: 3, thirdPartyAreas: 1, found: 6, chosen: 2 };

  it('RF-264 is a chosen run when own-code areas were left out', () => {
    expect(isChosenRun(run)).toBe(true);
  });

  it('RF-264 is not a chosen run when only third-party areas were asked for', () => {
    expect(isChosenRun({ ...run, chosen: 0, thirdPartyAreas: 2, found: 6 })).toBe(false);
  });

  it('RF-264 is not a chosen run when the chosen and third-party areas are all there is', () => {
    expect(isChosenRun({ ...run, found: 3 })).toBe(false);
  });
});

describe('notCoveredOf', () => {
  const base = { thirdParty: false, selected: true, ended: true, cards: 2 };

  it('RF-264 lists each area the run did not explain, in the order given, and no other', () => {
    const lines = notCoveredOf([
      { ...base, name: 'Orders' },
      { ...base, name: 'Vendor', thirdParty: true, cards: 0 },
      { ...base, name: 'Legacy', selected: false, ended: false, cards: 0 },
      { ...base, name: 'Reports', ended: false, cards: 0 },
      { ...base, name: 'Mail', failure: 'the reader failed', cards: 0 },
      { ...base, name: 'Empty', cards: 0 },
    ]);

    expect(lines).toEqual([
      'Vendor: third-party code; nothing about the application was read from it.',
      'Legacy: not selected for this run.',
      'Reports: the run ended before its reader finished.',
      'Mail: its reader could not finish (the reader failed).',
      'Empty: no card was left after the citation check and the judgement.',
    ]);
  });

  it('RF-615 an area that failed with a code shows the next step of that code from the catalogue', () => {
    const [line] = notCoveredOf([
      { ...base, name: 'Loan.xlsx', failure: 'failed (RST-1522)', cards: 0 },
    ]);

    expect(line).toContain('Loan.xlsx: its reader could not finish (failed (RST-1522)).');
    expect(line).toContain(describeError(ERROR_CODES.ollamaPromptTooLarge).nextStep);
    expect(line).toContain('Context size');
  });

  it('RF-615 an area that failed with a word that is no code gets no next step', () => {
    const [line] = notCoveredOf([
      { ...base, name: 'Mail', failure: 'failed (RST-0000)', cards: 0 },
      { ...base, name: 'Plain', failure: 'invalid output', cards: 0 },
    ]);

    expect(line).toBe('Mail: its reader could not finish (failed (RST-0000)).');
  });

  it('RF-264 lists nothing when every area gave a card', () => {
    expect(notCoveredOf([{ ...base, name: 'Orders' }])).toEqual([]);
  });
});

describe('questionLinks', () => {
  it('RF-264 links a question to the first section that links a card sharing a cited file', () => {
    const { sections } = fullOverview();

    expect(questionLinks(sections, overviewCards())).toEqual([
      { cardId: 'OQ-001', section: 'features' },
    ]);
  });

  it('RF-264 gives a question that shares no file with any statement no link', () => {
    const { sections } = fullOverview();
    const unrelated = sections.filter((section) => section.id === 'application');

    expect(questionLinks(unrelated, overviewCards())).toEqual([]);
  });
});
