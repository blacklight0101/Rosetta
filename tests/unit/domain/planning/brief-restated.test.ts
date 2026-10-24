import { describe, expect, it } from 'vitest';
import { decideOnce } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-608, RF-609, RF-610: a planner decision with no source card that only restates a choice of
// the brief is left out; the links that pointed at it point at the brief's record; the records
// that stay are numbered in order without gaps.

const supported = new Set(['FEAT-001', 'BR-001']);

function decision(title: string, text = 'It is decided.', sources: string[] = []): DraftDecision {
  return { title, context: 'Context.', decision: text, consequences: 'Consequences.', sources };
}

/** One environment per link; each names the draft decision at that position, from 1, or none. */
function contentOf(decisions: DraftDecision[], links: (number | null)[]) {
  const environments = links.map((at, index) => ({
    ...{ name: `Env ${String(index)}`, purpose: 'Runs it.' },
    decision: at,
  }));
  return assemblePlan(
    {
      ...{ summary: 'A shop.', requirements: [], components: [], decisions, entities: [] },
      ...{ phases: [], tasks: [], risks: [] },
      technical: { integrations: [], security: [], targets: [], environments },
    },
    supported,
  ).content;
}

function decided(answers: BriefAnswers, decisions: DraftDecision[], links: (number | null)[] = []) {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  return decideOnce(contentOf(decisions, links), brief, shippedCatalogue, { supported, cards: [] });
}

const layered: BriefAnswers = { architecture: { style: 'layered' } };

describe('decideOnce: the style', () => {
  it('RF-608 leaves out a decision with no source that adopts the chosen style, and says where it is decided', () => {
    const { content, restated } = decided(layered, [decision('Adopt layered architecture')]);

    expect(content.decisions.map((each) => each.title)).toEqual([
      'Architecture style: Layered (N-tier)',
      'Migration strategy: Strangler Fig',
    ]);
    expect(restated).toEqual([{ title: 'Adopt layered architecture', record: 'ADR-001' }]);
  });

  it('RF-608 keeps a decision that names the style when a source card makes it necessary', () => {
    const kept = decision('Adopt layered architecture', 'Layers.', ['BR-001']);

    const { content, restated } = decided(layered, [kept]);

    expect(content.decisions.map((each) => each.id)).toEqual(['ADR-001', 'ADR-002', 'ADR-003']);
    expect(content.decisions[0]?.title).toBe('Adopt layered architecture');
    expect(restated).toEqual([]);
  });

  it('RF-608 keeps a decision on another subject, with or without a source', () => {
    const { content, restated } = decided(layered, [
      decision('Deliver email through a queue'),
      decision('Keep prices in cents', 'Prices are whole cents.', ['BR-001']),
    ]);

    expect(content.decisions.map((each) => each.title).slice(0, 2)).toEqual([
      'Deliver email through a queue',
      'Keep prices in cents',
    ]);
    expect(restated).toEqual([]);
  });

  it('RF-608 keeps a decision that adopts a style the owner did not choose', () => {
    const { restated } = decided(layered, [decision('Adopt hexagonal architecture')]);

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: a style named in brackets in the catalogue', () => {
  const hexagonal: BriefAnswers = { architecture: { style: 'hexagonal' } };

  it('RF-608 drops a decision that names the chosen style by the note in its catalogue title', () => {
    const { content, restated, choices } = decided(hexagonal, [
      decision('Use ports and adapters architecture'),
    ]);

    expect(restated).toEqual([
      { title: 'Use ports and adapters architecture', record: choices.style },
    ]);
    expect(content.decisions.map((each) => each.title)).not.toContain(
      'Use ports and adapters architecture',
    );
  });

  it('RF-608 drops a decision that names the chosen style by its id', () => {
    const { restated } = decided(hexagonal, [decision('Adopt hexagonal architecture')]);

    expect(restated.map((each) => each.title)).toEqual(['Adopt hexagonal architecture']);
  });

  it('RF-608 keeps decisions on other subjects under a bracketed style', () => {
    const { restated } = decided(hexagonal, [
      decision('Store VAT as a fraction in PostgreSQL', 'VAT is a fraction.'),
      decision('Use layered error handling', 'Each layer wraps the error of the one below.'),
    ]);

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: only the title counts', () => {
  it('RF-608 keeps a decision whose text mentions a choice of the brief but whose title is about something else', () => {
    const { restated } = decided(
      {
        architecture: { style: 'layered' },
        stack: [{ layer: 'database', choice: 'PostgreSQL 17', custom: false }],
      },
      [
        decision('Store VAT as a fraction in PostgreSQL', 'VAT is a fraction.'),
        decision('Use layered error handling', 'Each layer wraps the error of the one below.'),
        decision('Number invoices inside one database transaction'),
        decision("Take today's date from a clock port"),
        decision('Architecture style selection', 'Something else.'),
      ],
    );

    expect(restated).toEqual([]);
  });

  it('RF-608 keeps a decision whose title is neutral when only its text names the style', () => {
    const { restated } = decided(layered, [
      decision('Error handling', 'Adopt layered architecture for errors.'),
    ]);

    expect(restated).toEqual([]);
  });

  it('RF-610 drops the rewrite with one cut-over and keeps a rewrite of one part', () => {
    const { restated } = decided({ migration: 'rewrite' }, [
      decision('Rewrite with one cut-over after a comparison'),
      decision('Rewrite the pricing rules in the new language'),
      decision('Plan the cut-over of the pricing rules'),
    ]);

    expect(restated.map((each) => each.title)).toEqual([
      'Rewrite with one cut-over after a comparison',
    ]);
  });
});

describe('decideOnce: a layer named in the title', () => {
  it('RF-609 drops a title that names the technology with its layer, even without a verb', () => {
    const answers: BriefAnswers = {
      stack: [{ layer: 'backend-framework', choice: 'ASP.NET Core Razor Pages', custom: true }],
    };

    const { restated } = decided(answers, [
      decision('ASP.NET Core Razor Pages for Backend'),
      decision('Razor Pages views stay thin'),
    ]);

    expect(restated.map((each) => each.title)).toEqual(['ASP.NET Core Razor Pages for Backend']);
  });

  it('RF-608 does not find the style inside a longer word', () => {
    const { restated } = decided({ migration: 'strangler-fig' }, [
      decision('Multilayered caching', 'Cache in two layers.'),
    ]);

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: the migration and the stack', () => {
  it('RF-610 leaves out a restated migration strategy and keeps one record for it', () => {
    const { content, restated, choices } = decided({ migration: 'strangler-fig' }, [
      decision('Migration by strangler-fig'),
    ]);

    expect(restated).toEqual([{ title: 'Migration by strangler-fig', record: choices.migration }]);
    expect(content.decisions.filter((each) => each.title.startsWith('Migration'))).toHaveLength(1);
  });

  it('RF-609 leaves out a decision that names the technology of an answered layer', () => {
    const answers: BriefAnswers = {
      stack: [{ layer: 'database', choice: 'PostgreSQL 17', custom: false }],
    };

    const { restated, choices } = decided(answers, [
      decision('Use PostgreSQL for storage'),
      decision('Use Redis for sessions'),
    ]);

    expect(restated).toEqual([
      { title: 'Use PostgreSQL for storage', record: choices.stack[0]?.decision },
    ]);
  });

  it('RF-609 does not match a layer nobody answered, a version alone or a two-letter word', () => {
    const answers: BriefAnswers = {
      stack: [
        { layer: 'database', choice: '17', custom: true },
        { layer: 'hosting', choice: 'Go', custom: true },
      ],
    };

    const { restated } = decided(answers, [
      decision('Use PostgreSQL for storage'),
      decision('Version 17 of the plan'),
      decision('Go live in two steps'),
    ]);

    expect(restated).toEqual([]);
  });
});

describe('decideOnce: links and numbers', () => {
  it('RF-608 points a link at the brief record when its decision was left out, and renumbers the others', () => {
    const { content, restated } = decided(
      layered,
      [
        decision('Deliver email through a queue'),
        decision('Adopt layered architecture'),
        decision('Keep prices in cents', 'Cents.', ['BR-001']),
      ],
      [1, 2, 3, null],
    );

    expect(content.decisions.map((each) => each.id)).toEqual([
      'ADR-001',
      'ADR-002',
      'ADR-003',
      'ADR-004',
    ]);
    expect(restated).toEqual([{ title: 'Adopt layered architecture', record: 'ADR-003' }]);
    expect(content.technical.environments.map((each) => each.decision)).toEqual([
      'ADR-001',
      'ADR-003',
      'ADR-002',
      '',
    ]);
  });
});

describe('decideOnce: the other technical items', () => {
  it('RF-608 points links of the other technical items at the brief record too', () => {
    const brief = { ...buildBrief(layered, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
    const content = assemblePlan(
      {
        ...{ summary: 'A shop.', requirements: [], components: [], entities: [], phases: [] },
        ...{ tasks: [], risks: [], decisions: [decision('Adopt layered architecture')] },
        technical: {
          integrations: [{ card: 'INT-001', action: 'keep', note: 'n', decision: 1 }],
          security: [
            {
              ...{ name: 'Filter', approach: 'other', description: 'd', invariant: '' },
              ...{ alternative: '', sources: ['BR-001'], decision: 1 },
            },
          ],
          targets: [{ name: 'Speed', target: 'Fast.', sources: ['FEAT-001'], decision: 1 }],
          environments: [],
        },
      },
      new Set(['FEAT-001', 'BR-001', 'INT-001']),
    ).content;

    const { technical } = decideOnce(content, brief, shippedCatalogue, {
      supported,
      cards: [],
    }).content;

    expect(technical.integrations.map((each) => each.decision)).toEqual(['ADR-001']);
    expect(technical.security.map((each) => each.decision)).toEqual(['ADR-001']);
    expect(technical.targets.map((each) => each.decision)).toEqual(['ADR-001']);
  });
});
