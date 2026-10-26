import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import {
  gridCite,
  gridCodePath,
  gridDraft,
  gridPath,
  gridScreen,
} from '../../../support/grid-page-fixtures.js';

// P5-44, P5-31, RF-626, ADR-005: a link or an action the markup reader cannot match cites the
// lines the agent gave for it, not the lines of the whole card.

function derived(screen = gridScreen) {
  const card = createCard({ ...gridDraft(screen), id: 'SCRN-001', agentTaskId: 't' });
  if (!card.ok) throw new Error('fixture');
  return card.value;
}

const claim = (text: string, screen = gridScreen) =>
  derived(screen).claims.find((each) => each.text === text);

describe('P5-44 a link the markup reader cannot match', () => {
  it('P5-44 a link in a grid template cites the template line the agent gave for it', () => {
    expect(claim('The screen leads to Bill.aspx.')?.citations).toEqual([gridCite(gridPath, 8, 10)]);
  });

  it('P5-44 a redirect in code-behind cites the redirect line', () => {
    expect(claim('The screen leads to HistoryUpdate.aspx.')?.citations).toEqual([
      gridCite(gridCodePath, 14),
    ]);
  });

  it('P5-44 a link no line names cites the first range of the card only', () => {
    expect(claim('The screen leads to Missing.aspx.')?.citations).toEqual([
      gridCite(gridPath, 1, 17),
    ]);
  });
});

describe('P5-44 an action the markup reader cannot match', () => {
  it('P5-44 an unmatched button cites the lines of the agent that name its handler', () => {
    const text = 'Action Export starts the handler Export_Click.';

    expect(claim(text)?.citations).toEqual([gridCite(gridCodePath, 30, 34)]);
  });

  it('P5-44 an action no line names cites the first range of the card only', () => {
    const text = 'Action Archive starts the handler Archive_Click.';

    expect(claim(text)?.citations).toEqual([gridCite(gridPath, 1, 17)]);
  });

  it('P5-44 the card note says which claims could cite only the first range', () => {
    const note = derived().note ?? '';

    expect(note).toContain('Archive');
    expect(note).toContain('Missing.aspx');
    expect(note).not.toContain('Export');
    expect(note).not.toContain('HistoryUpdate');
  });

  it('P5-44 a button the markup matches still cites its own element', () => {
    expect(claim('Print starts btnPrint_Click.')?.citations).toEqual([gridCite(gridPath, 14)]);
  });

  it('P5-44 a screen with no markup keeps the lines of the whole card', () => {
    const screen = { ...gridScreen, markup: undefined };

    const archive = claim('Action Archive starts the handler Archive_Click.', screen);

    expect(archive?.citations).toHaveLength(4);
    expect(derived(screen).note).toBeUndefined();
  });
});
