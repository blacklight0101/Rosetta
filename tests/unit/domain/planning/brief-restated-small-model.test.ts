import { describe, expect, it } from 'vitest';
import { decideOnce } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-608, RF-609, RF-610, P8-07, EV-60: the phrasing of a small local model (a title that adopts the
// style by its name, a text that says the choice and then gives a reason) restates the brief too.
// The three shapes follow the Ollama Invoice, Asset Manager and eShop runs; synthetic wording.

const supported = new Set(['FEAT-001', 'BR-001']);

function decision(title: string, text: string, sources: string[] = []): DraftDecision {
  return { title, context: 'Context.', decision: text, consequences: 'Consequences.', sources };
}

function restatedTitles(answers: BriefAnswers, decisions: DraftDecision[]): string[] {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  const content = assemblePlan(
    {
      ...{ summary: 'A shop.', requirements: [], components: [], decisions, entities: [] },
      ...{ phases: [], tasks: [], risks: [] },
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    supported,
  ).content;
  return decideOnce(content, brief, shippedCatalogue, { supported, cards: [] }).restated.map(
    (each) => each.title,
  );
}

const layered: BriefAnswers = { architecture: { style: 'layered' } };

describe('decideOnce: a title that adopts the style by its name', () => {
  it('RF-608 drops "Adopt a Layered Approach" that says nothing more', () => {
    expect(
      restatedTitles(layered, [decision('Adopt a Layered Approach', 'We will go layered.')]),
    ).toEqual(['Adopt a Layered Approach']);
  });

  it('RF-608 keeps a title that adopts the style and adds a pattern of its own', () => {
    expect(
      restatedTitles(layered, [
        decision('Adopt a Layered Approach with an outbox', 'Events go through an outbox table.'),
      ]),
    ).toEqual([]);
  });
});

describe('decideOnce: a text that gives a reason after the choice', () => {
  it('RF-608 drops a subject title whose text names the style and then explains why', () => {
    expect(
      restatedTitles(layered, [
        decision(
          'Architecture Style Adoption',
          'We will adopt a layered architecture because it keeps concerns separate and is familiar to the team.',
        ),
      ]),
    ).toEqual(['Architecture Style Adoption']);
  });

  it('RF-610 drops a migration subject whose text names the strategy and then explains why', () => {
    expect(
      restatedTitles({ migration: 'strangler-fig' }, [
        decision(
          'Migration Strategy Adoption',
          'The migration follows the strangler fig strategy, which lets modules move one at a time.',
        ),
      ]),
    ).toEqual(['Migration Strategy Adoption']);
  });

  it('RF-608 keeps a text that adds a decision before the reason', () => {
    expect(
      restatedTitles(layered, [
        decision(
          'Architecture Style Adoption',
          'Adopt a layered architecture with a shared kernel project because teams reuse it.',
        ),
      ]),
    ).toEqual([]);
  });

  it('RF-608 keeps a text that only has a reason and names no choice', () => {
    expect(
      restatedTitles(layered, [
        decision('Architecture Style Adoption', 'Because the team knows services and pages.'),
      ]),
    ).toEqual([]);
  });
});

describe('decideOnce: a reason that adds a component', () => {
  it('RF-608 keeps a text whose "which" clause adds an event bus and a cache', () => {
    expect(
      restatedTitles(layered, [
        decision(
          'Architecture Style Adoption',
          'Adopt layered, which includes an event bus and a Redis cache.',
        ),
      ]),
    ).toEqual([]);
  });

  it('RF-608 keeps a text whose "ensuring" clause adds a command bus', () => {
    expect(
      restatedTitles(layered, [
        decision(
          'Architecture Style Adoption',
          'Use layered architecture, ensuring every write goes through a CQRS command bus.',
        ),
      ]),
    ).toEqual([]);
  });

  it('RF-608 keeps a title that adopts the style when the text adds a saga orchestrator', () => {
    expect(
      restatedTitles(layered, [
        decision('Adopt a Layered Approach', 'Long workflows run in a saga orchestrator.'),
      ]),
    ).toEqual([]);
  });
});
