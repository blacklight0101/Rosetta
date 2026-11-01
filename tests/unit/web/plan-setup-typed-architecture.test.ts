import { describe, expect, it } from 'vitest';
import { keepProposed, typeOwn } from '../../../web/src/lib/plan-setup/choices.js';
import { answersOf, draftOf } from '../../../web/src/lib/plan-setup/draft.js';
import { planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// EV-73, RF-645: a typed architecture answer keeps what Rosetta proposed, so the ADR of the own
// answer can name the recommendation and list the proposed styles.

const draft = draftOf(unsavedBrief.brief);
const typed = typeOwn(draft, 'architecture', 'Modular monolith with a separate reporting module');

describe('EV-73 a typed architecture answer', () => {
  it('EV-73 keeps the proposed styles and their evidence once the options are known', () => {
    const kept = keepProposed(typed, planOptions);

    expect(kept.recommended).toEqual(['modular-monolith', 'hexagonal']);
  });

  it('EV-73 is saved with the recommendation next to the typed text, not an empty list', () => {
    const sent = answersOf(keepProposed(typed, planOptions));

    expect(sent.architecture?.recommended).toEqual(['modular-monolith', 'hexagonal']);
    expect(sent.architecture?.evidence).toEqual(['BR-001']);
    expect(sent.typed?.['architecture']).toMatch(/reporting module/u);
  });

  it('EV-73 sends no architecture block for a typed answer whose text is empty', () => {
    const empty = keepProposed(typeOwn(draft, 'architecture', ''), planOptions);

    expect(answersOf(empty).architecture).toBeUndefined();
  });

  it('EV-73 leaves a draft that is not typed, or has no options, as it is', () => {
    expect(keepProposed(draft, planOptions)).toBe(draft);
    expect(keepProposed(typed, undefined)).toBe(typed);
  });
});
