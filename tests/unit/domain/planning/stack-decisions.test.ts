import { describe, expect, it } from 'vitest';
import { briefDecisions } from '../../../../src/domain/planning/brief-decisions.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609: a stack record states its context from the source cards that describe the legacy layer,
// lists the options of the catalogue for the layer, and names the task cards that touch it.

function sourceCard(id: string, type: SourceCard['type'], title: string, text: string): SourceCard {
  const citations = [{ path: 'src/Web/Orders.cshtml', startLine: 1, endLine: 4 }];
  return {
    ...{ id, type, title, area: 'orders', summary: `${title}.` },
    claims: [{ claimId: `${id}.c1`, text, citations, status: 'Supported' }],
  };
}

const cards = [
  sourceCard(
    'FEAT-001',
    'FEAT',
    'Order list',
    'The orders page is a Web Forms page of the server.',
  ),
  sourceCard('ENT-001', 'ENT', 'Order', 'An order is stored in the SQL Server table Orders.'),
];
const tasks = [
  { id: 'T-001', title: 'Build the Razor Pages for orders', files: ['src/Pages/Orders.cshtml'] },
  { id: 'T-002', title: 'Send the invoice mail', files: ['src/Mail/Invoice.cs'] },
];

function recordsFor(answers: BriefAnswers, withCards = cards) {
  const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  const supported = new Set(withCards.map((card) => card.id));
  const { decisions } = briefDecisions(
    brief,
    shippedCatalogue,
    { supported, cards: withCards, tasks },
    0,
  );
  return decisions.filter((each) => each.title.startsWith('Technology for'));
}

const stack: BriefAnswers = {
  stack: [
    {
      layer: 'front-end',
      choice: 'Razor views with htmx',
      custom: false,
      offered: ['Razor views with htmx', 'React with Vite'],
    },
    {
      layer: 'database',
      choice: 'Postgres 17 on our servers',
      custom: true,
      offered: ['SQL Server 2022', 'PostgreSQL 17'],
    },
  ],
};

describe('briefDecisions: the stack record (RF-609)', () => {
  it('RF-609 takes the context from the cards that describe the legacy layer and lists them as sources', () => {
    const [frontEnd, database] = recordsFor(stack);

    expect(frontEnd?.sources).toEqual(['FEAT-001']);
    expect(frontEnd?.context).toContain('FEAT-001');
    expect(frontEnd?.context).not.toContain('The package names a technology only where');
    expect(database?.sources).toEqual(['ENT-001']);
  });

  it('RF-609 says so when no source card describes the legacy layer', () => {
    const [hosting] = recordsFor({
      stack: [{ layer: 'hosting', choice: 'Our own servers', custom: true }],
    });

    expect(hosting?.context).toContain('No source card describes the legacy hosting.');
    expect(hosting?.sources).toEqual([]);
  });

  it('RF-609 lists the options the owner was offered with one line each and marks the choice', () => {
    const [frontEnd, database] = recordsFor(stack);

    expect(frontEnd?.options).toHaveLength(2);
    expect(frontEnd?.options[0]).toMatch(/^Razor views with htmx \(chosen\): .+/u);
    expect(frontEnd?.options[1]).toMatch(/^React with Vite: .+/u);
    // a typed choice is added next to the options that were offered, not instead of them
    expect(database?.options).toHaveLength(3);
    expect(database?.options[0]).toMatch(
      /^Postgres 17 on our servers \(chosen\): typed by the owner/u,
    );
    expect(database?.options.slice(1).some((each) => each.startsWith('SQL Server 2022:'))).toBe(
      true,
    );
  });

  it('RF-609 lists no fixed table when the brief recorded no offer', () => {
    const [hosting] = recordsFor({
      stack: [{ layer: 'hosting', choice: 'IIS', custom: false }],
    });

    expect(hosting?.options).toEqual([
      'IIS (chosen): the options Rosetta offered were not recorded for this brief.',
    ]);
  });
});

describe('briefDecisions: the task cards of the stack record (RF-609)', () => {
  it('RF-609 names the task cards that touch the layer', () => {
    const [frontEnd, database] = recordsFor(stack);

    expect(frontEnd?.consequences).toContain('T-001');
    expect(frontEnd?.consequences).not.toContain('T-002');
    expect(database?.consequences).toContain('No task card');
  });

  it('RF-609 is deterministic', () => {
    expect(recordsFor(stack)).toEqual(recordsFor(stack));
  });
});
