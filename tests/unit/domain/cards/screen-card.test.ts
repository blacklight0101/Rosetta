import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

const ids = { id: 'SCRN-001', agentTaskId: 't' };

describe('createCard for a SCRN card', () => {
  it('RF-261 keeps the route, roles, fields, actions and links', () => {
    const card = createCard({ ...screenDraft(), ...ids });

    expect(card.ok && card.value.screen).toEqual(validScreen);
  });

  it('RF-261 a screen without its detail is refused', () => {
    const { screen, ...bare } = screenDraft();

    expect(screen).toBeDefined();
    expect(createCard({ ...bare, ...ids })).toEqual({ ok: false, error: 'screen-missing' });
  });

  it('RF-261 a validation without a citation is refused', () => {
    const field = { name: 'Email', inputKind: 'text', required: true };
    const fields = [{ ...field, validations: [{ text: 'x', citations: [] }] }];

    expect(createCard({ ...screenDraft({ ...validScreen, fields }), ...ids })).toEqual({
      ok: false,
      error: 'validation-without-citation',
    });
  });

  it('RF-261 an action that names neither a handler nor a FLOW card is refused', () => {
    const actions = [{ label: 'Pay' }];

    expect(createCard({ ...screenDraft({ ...validScreen, actions }), ...ids })).toEqual({
      ok: false,
      error: 'action-without-target',
    });
  });

  it('RF-261 an action may name a FLOW card instead of a handler', () => {
    const actions = [{ label: 'Pay', flow: 'FLOW-001' }];

    expect(createCard({ ...screenDraft({ ...validScreen, actions }), ...ids }).ok).toBe(true);
  });

  it('RF-261 a card that is not a SCRN carries no screen detail', () => {
    const card = createCard({
      ...draftOf(),
      screen: validScreen,
      id: 'FEAT-001',
      agentTaskId: 't',
    });

    expect(card.ok && card.value.screen).toBeUndefined();
  });
});
