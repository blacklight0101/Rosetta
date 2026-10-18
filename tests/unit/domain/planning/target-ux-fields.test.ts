import { describe, expect, it } from 'vitest';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { assembleUx } from '../../../../src/domain/planning/target-ux-assembly.js';
import { screenCard } from '../../../support/ux-fixtures.js';

// RF-626, ADR-005, owner decision 2026-10-18: a wireframe lists the supported fields; a field of
// an old card that no claim states is listed apart, to be drawn "not checked"; a screen whose
// fields were all refused is flagged, so the wireframe says "fields not confirmed".

const field = (name: string) => ({ name, inputKind: 'text', required: false });

function withFields(
  id: string,
  extra: {
    fields?: readonly string[];
    unchecked?: readonly string[];
    unsupported?: number;
  },
): SourceCard {
  const card = screenCard(id, { title: `Screen ${id}`, route: `/${id}` });
  if (card.screen === undefined) throw new Error('The fixture has a screen');
  return {
    ...card,
    screen: {
      ...card.screen,
      fields: (extra.fields ?? []).map(field),
      uncheckedFields: (extra.unchecked ?? []).map(field),
      unsupportedFields: extra.unsupported ?? 0,
    },
  };
}

function oneScreen(...cards: SourceCard[]) {
  const draft = {
    screens: [
      { ...{ name: 'Merged', purpose: 'P.', reason: 'R.' }, cards: cards.map((c) => c.id) },
    ],
    dropped: [],
    designBrief: { audience: '', tone: '', components: [] },
  };
  const screen = assembleUx(draft, cards).ux.screens[0];
  if (screen === undefined) throw new Error('One screen is planned');
  return screen;
}

describe('assembleUx: the fields of a screen', () => {
  it('RF-626 lists the supported fields and leaves the refused ones out', () => {
    const screen = oneScreen(withFields('SCRN-001', { fields: ['Search'], unsupported: 1 }));

    expect(screen.fields.map((each) => each.name)).toEqual(['Search']);
    expect(screen.uncheckedFields).toEqual([]);
    expect(screen.fieldsNotConfirmed).toBe(false);
  });

  it('RF-626 a screen whose fields are all unsupported is still planned, flagged not confirmed', () => {
    const screen = oneScreen(withFields('SCRN-001', { unsupported: 2 }));

    expect(screen.fields).toEqual([]);
    expect(screen.fieldsNotConfirmed).toBe(true);
  });

  it('RF-626 a screen with no field at all is not flagged', () => {
    expect(oneScreen(withFields('SCRN-001', {})).fieldsNotConfirmed).toBe(false);
  });

  it('RF-626 the fields of an old card are listed apart as not checked, once, and not as facts', () => {
    const screen = oneScreen(
      withFields('SCRN-001', { unchecked: ['Legacy', 'Other'] }),
      withFields('SCRN-002', { unchecked: ['Legacy'] }),
    );

    expect(screen.fields).toEqual([]);
    expect(screen.uncheckedFields.map((each) => each.name)).toEqual(['Legacy', 'Other']);
    expect(screen.fieldsNotConfirmed).toBe(false);
  });
});

describe('assembleUx: the fields of merged screens', () => {
  it('RF-626 a field confirmed by one card is not also listed as not checked by another', () => {
    const screen = oneScreen(
      withFields('SCRN-001', { fields: ['Search'] }),
      withFields('SCRN-002', { unchecked: ['Search', 'Legacy'] }),
    );

    expect(screen.fields.map((each) => each.name)).toEqual(['Search']);
    expect(screen.uncheckedFields.map((each) => each.name)).toEqual(['Legacy']);
  });

  it('RF-626 merged cards: a refused field on one card and a supported one on the other keep the supported', () => {
    const screen = oneScreen(
      withFields('SCRN-001', { unsupported: 1 }),
      withFields('SCRN-002', { fields: ['Search'] }),
    );

    expect(screen.fields.map((each) => each.name)).toEqual(['Search']);
    expect(screen.fieldsNotConfirmed).toBe(false);
  });

  it('RF-626 a screen with unchecked fields and a refused one shows the unchecked, not the note', () => {
    const screen = oneScreen(withFields('SCRN-001', { unchecked: ['Legacy'], unsupported: 1 }));

    expect(screen.fieldsNotConfirmed).toBe(false);
    expect(screen.uncheckedFields).toHaveLength(1);
  });
});
