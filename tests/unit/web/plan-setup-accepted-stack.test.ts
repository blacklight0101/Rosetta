import { describe, expect, it } from 'vitest';
import { acceptedStack, chooseLayer } from '../../../web/src/lib/plan-setup/choices.js';
import { draftOf } from '../../../web/src/lib/plan-setup/draft.js';
import { planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// P7-29, DEC-203: after the consent a skipped layer takes the planner's recommended option (the first
// of its options); before it the draft is untouched, so the server takes the catalogue's.

const draft = draftOf(unsavedBrief.brief);
const layer = planOptions.stack[0]?.layer ?? '';
const first = planOptions.stack[0]?.options[0];

describe('acceptedStack', () => {
  it('RF-609 takes the first planner option for a layer left unanswered', () => {
    const next = acceptedStack(draft, planOptions);
    expect(next.stack[layer]?.choice).toBe(first);
    expect(next.stack[layer]?.custom).toBe(false);
  });

  it('RF-609 leaves the draft as it is before the consent (no planner options)', () => {
    expect(acceptedStack(draft, undefined)).toBe(draft);
  });

  it('RF-609 never replaces a layer the person answered', () => {
    const own = chooseLayer(draft, layer, { choice: 'Mine', custom: true });
    expect(acceptedStack(own, planOptions).stack[layer]?.choice).toBe('Mine');
  });
});
