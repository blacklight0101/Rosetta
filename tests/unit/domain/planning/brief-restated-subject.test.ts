import { describe, expect, it } from 'vitest';
import { decideOnce } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-608, RF-609, RF-610, DEC-187, EV-60: a planner decision with no source card that only says
// again what the brief records, the typed answers or the owner's answers is left out, found by its
// subject and its text and not only by the words of the catalogue.

const supported = new Set(['FEAT-001', 'BR-001']);

function decision(title: string, text: string, sources: string[] = []): DraftDecision {
  return { title, context: 'Context.', decision: text, consequences: 'Consequences.', sources };
}

function decided(answers: BriefAnswers, decisions: DraftDecision[]) {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  const content = assemblePlan(
    {
      ...{ summary: 'A shop.', requirements: [], components: [], decisions, entities: [] },
      ...{ phases: [], tasks: [], risks: [] },
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    supported,
  ).content;
  return decideOnce(content, brief, shippedCatalogue, { supported, cards: [] });
}

const typedArchitecture: BriefAnswers = {
  architecture: { style: 'layered' },
  typed: { architecture: 'Modular monolith with a separate reporting module' },
};

describe('decideOnce: a subject title with the choice in its text', () => {
  it('RF-608 drops "Architecture Style Adoption" that adopts the style of the brief', () => {
    const { restated } = decided({ architecture: { style: 'layered' } }, [
      decision('Architecture Style Adoption', 'Adopt layered architecture for the new system.'),
    ]);

    expect(restated.map((each) => each.title)).toEqual(['Architecture Style Adoption']);
  });

  it('RF-610 drops "Migration Order Focus" that names the strategy of the brief', () => {
    const { restated, choices } = decided({ migration: 'strangler-fig' }, [
      decision('Migration Order Focus', 'Migrate by strangler fig.'),
    ]);

    expect(restated).toEqual([{ title: 'Migration Order Focus', record: choices.migration }]);
  });

  it('RF-609 drops "Technology Stack Selection" that lists the answered technologies', () => {
    const { restated } = decided(
      {
        stack: [
          { layer: 'database', choice: 'PostgreSQL 17', custom: false },
          { layer: 'hosting', choice: 'Azure App Service', custom: false },
        ],
      },
      [decision('Technology Stack Selection', 'Use PostgreSQL 17 on Azure App Service.')],
    );

    expect(restated.map((each) => each.title)).toEqual(['Technology Stack Selection']);
  });

  it('RF-608 keeps a subject title whose text decides something else, or has a source', () => {
    const { restated } = decided(
      {
        architecture: { style: 'layered' },
        stack: [{ layer: 'database', choice: 'PostgreSQL 17', custom: false }],
      },
      [
        decision('Architecture Style Adoption', 'Rules live in services that pages call.'),
        decision('Technology Stack Selection', 'Prefer boring technology.'),
        decision('Architecture Style Adoption', 'Adopt layered architecture.', ['BR-001']),
      ],
    );

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: the typed answers', () => {
  it('RF-608 drops a decision whose title says the typed architecture again', () => {
    const { restated } = decided(typedArchitecture, [
      decision('Adopt Modular monolith with a separate reporting module', 'One deployable unit.'),
    ]);

    expect(restated.map((each) => each.title)).toEqual([
      'Adopt Modular monolith with a separate reporting module',
    ]);
  });

  it('RF-608 drops a subject title whose text says the typed architecture again', () => {
    const { restated } = decided(typedArchitecture, [
      decision(
        'Architecture Style Adoption',
        'Build a modular monolith with a separate reporting module.',
      ),
    ]);

    expect(restated).toHaveLength(1);
  });

  it('RF-608 keeps a decision on another subject that mentions the typed words in passing', () => {
    const { restated } = decided(typedArchitecture, [
      decision('Reports run nightly', 'A separate reporting module reads a replica.'),
    ]);

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: versions', () => {
  it('RF-609 finds a technology whose version sits inside its name in the text', () => {
    const { restated } = decided(
      {
        stack: [
          { layer: 'backend-framework', choice: 'ASP.NET Core 8 MVC', custom: true },
          { layer: 'database', choice: 'PostgreSQL 17', custom: true },
        ],
      },
      [decision('Technology Stack Selection', 'Use ASP.NET Core 8 MVC with PostgreSQL 16.')],
    );

    expect(restated).toHaveLength(1);
  });
});
