import { describe, expect, it } from 'vitest';
import { decideOnce } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import {
  buildBrief,
  type BriefAnswers,
  type StackLayer,
} from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-608, RF-609, RF-610, DEC-187, EV-60: the planner ADRs of the evaluation packages, verbatim,
// and genuine decisions under the same subject titles, which stay.

const supported = new Set(['FEAT-001', 'BR-001', 'OQ-015']);

/** A decision from its title and its context, decision and consequences. */
function adr(title: string, text: [string, string, string], sources: string[] = []): DraftDecision {
  const [context, decision, consequences] = text;
  return { title, context, decision, consequences, sources };
}

function restatedBy(answers: BriefAnswers, decisions: DraftDecision[]): string[] {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  const draft = { summary: 's', requirements: [], components: [], decisions, entities: [] };
  const content = assemblePlan(
    {
      ...draft,
      ...{ phases: [], tasks: [], risks: [] },
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    supported,
  ).content;
  return decideOnce(content, brief, shippedCatalogue, { supported, cards: [] }).restated.map(
    (each) => each.title,
  );
}

const stack = (pairs: [StackLayer, string][]) =>
  pairs.map(([layer, choice]) => ({ layer, choice, custom: true }));

const eShop: BriefAnswers = {
  architecture: { style: 'layered' },
  migration: 'strangler-fig',
  typed: { migration: 'Strangler fig, catalog first, WebForms last' },
  stack: stack([
    ['language-runtime', '.NET 8 with C#'],
    ['backend-framework', 'ASP.NET Core Minimal APIs'],
    ['front-end', 'Razor Pages'],
    ['database', 'SQL Server'],
    ['data-access', 'Entity Framework Core'],
    ['testing', 'xUnit.net'],
    ['hosting', 'Docker Compose'],
  ]),
};

describe('the ADR texts of the evaluation packages', () => {
  it('RF-608 drops the architecture ADR that restates the typed answer (Invoice)', () => {
    const out = restatedBy(
      {
        architecture: { style: 'layered' },
        typed: { architecture: 'Modular monolith with a separate reporting module' },
      },
      [
        adr('Architecture Style Adoption', [
          'The system needs a defined structure to manage its complexity.',
          'Adopt Modular monolith with a separate reporting module',
          'The system will be split into presentation, business, and data layers, with a dedicated reporting module.',
        ]),
      ],
    );

    expect(out).toEqual(['Architecture Style Adoption']);
  });
});

describe('the ADR texts of the eShop package', () => {
  it('RF-609 RF-610 drops the stack and migration ADRs that restate the brief (eShop)', () => {
    const out = restatedBy(eShop, [
      adr('Technology Stack Selection', [
        'The owner selected specific technologies for each layer.',
        'Use .NET 8 with C# for runtime, ASP.NET Core Minimal APIs for backend, Razor Pages for frontend, SQL Server for the database, Entity Framework Core for data access, xUnit.net for testing, and Docker Compose for hosting.',
        'The new system will leverage modern, cloud-native technologies supporting layered separation and containerization.',
      ]),
      adr('Migration Order Focus', [
        'The owner specified the migration order.',
        'The catalog module will be the first component to be migrated, followed by the WebForms parts.',
        'Initial development efforts will focus on replacing catalog-related features from the legacy system.',
      ]),
      adr(
        'Data Seeding Approach',
        [
          'Legacy data setup relied on CSV/ZIP files and initialization logic.',
          'Use PreconfiguredData/DataSeeding mechanisms integrated with CatalogDBInitializer during application startup to populate core catalog data.',
          'The data seeding logic will be preserved/re-implemented in the new data initialization flow.',
        ],
        ['OQ-015'],
      ),
    ]);

    expect(out).toEqual(['Technology Stack Selection', 'Migration Order Focus']);
  });

  it('RF-608 RF-610 drops the strategy and style ADRs that restate the brief (AM)', () => {
    const out = restatedBy({ architecture: { style: 'layered' }, migration: 'strangler-fig' }, [
      adr('Migration Strategy Adoption', [
        'The legacy system needs to be replaced piece by piece without immediate shutdown.',
        'Adopt strangler-fig migration strategy.',
        'The phases replace the legacy system one part at a time, and the legacy system remains running until the last part is transitioned.',
      ]),
      adr('Architecture Style Adoption', [
        'The complexity of the rules and data dependencies requires a structured separation of concerns.',
        'Use Layered (N-tier) architecture.',
        'The system must be split into presentation, business, and data layers where each layer only calls the one below it.',
      ]),
    ]);

    expect(out).toEqual(['Migration Strategy Adoption', 'Architecture Style Adoption']);
  });
});

const brief: BriefAnswers = {
  architecture: { style: 'layered' },
  migration: 'strangler-fig',
  stack: stack([
    ['database', 'SQL Server 2022'],
    ['data-access', 'Entity Framework Core 8'],
    ['front-end', 'Razor Pages'],
  ]),
};

describe('genuine decisions under a subject title stay', () => {
  it('RF-610 keeps "Migration Order" about the order of the modules', () => {
    const order = adr('Migration Order', [
      'Strangler fig needs an order.',
      'Move the catalogue first, then orders, then the admin pages, behind the strangler fig routing layer.',
      'Each slice ships alone.',
    ]);

    expect(restatedBy(brief, [order])).toEqual([]);
  });

  it('RF-610 keeps "Rollout Plan" about one store at a time', () => {
    const rollout = adr('Rollout Plan', [
      'Users need time.',
      'Roll out to one store at a time, as the strangler fig strategy allows.',
      'Slower.',
    ]);

    expect(restatedBy(brief, [rollout])).toEqual([]);
  });
});

describe('genuine decisions under a subject title stay (style, stack and others)', () => {
  it('RF-608 keeps "Architecture Pattern" about a repository inside layered', () => {
    const pattern = adr('Architecture Pattern', [
      'Rules are scattered.',
      'Inside the layered architecture, use a repository pattern for data access.',
      'More classes.',
    ]);

    expect(restatedBy(brief, [pattern])).toEqual([]);
  });

  it('RF-609 keeps "Technology Stack" about Testcontainers in CI', () => {
    const tests = adr('Technology Stack', [
      'Integration tests.',
      'Run SQL Server 2022 in Testcontainers and seed it with Entity Framework Core 8 migrations in CI.',
      'Slower CI.',
    ]);

    expect(restatedBy(brief, [tests])).toEqual([]);
  });

  it('RF-608 keeps decisions on other subjects', () => {
    const out = restatedBy(brief, [
      adr('Keep brand delete as a no-op', ['c', 'Keep the delete a no-op.', 'x']),
      adr('Replace the mock catalog with the database', [
        'c',
        'Use SQL Server for the catalog instead of the mock.',
        'x',
      ]),
    ]);

    expect(out).toEqual([]);
  });
});
