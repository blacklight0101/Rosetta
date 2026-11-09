import { describe, expect, it } from 'vitest';
import { noApiContract } from '../../../../src/domain/planning/api-contract.js';
import {
  buildBrief,
  type PlanningBrief,
  type StackLayer,
} from '../../../../src/domain/planning/planning-brief.js';
import { stackClashes } from '../../../../src/domain/planning/stack-rules.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609, DEC-208 (P8-21): a layer whose technology belongs to a platform other than the language's
// is a clash; the package never asks for a .NET language with a Node.js framework in silence.

const stack = shippedCatalogue.stack;
const contract = noApiContract('Pages are rendered by the server.');
const id = 'technology-of-another-platform';

function briefOf(
  picks: readonly (readonly [StackLayer, string])[],
  proposed = false,
): PlanningBrief {
  const entries = picks.map(([layer, choice]) => ({
    layer,
    choice,
    custom: false,
    ...(proposed ? { proposed: true as const } : {}),
  }));
  return {
    ...buildBrief({ stack: [] }, shippedCatalogue),
    stack: entries,
    savedAt: '2026-11-03T09:00:00.000Z',
  };
}

const platformClashes = (brief: PlanningBrief) =>
  stackClashes(brief, contract, stack).filter((each) => each.rule === id);

describe('stackClashes: a technology of another platform (DEC-208)', () => {
  it('RF-609 flags a Node.js framework and a Node.js test runner with C# on .NET, one clash for each layer', () => {
    const brief = briefOf([
      ['language-runtime', 'C# on .NET'],
      ['backend-framework', 'Fastify'],
      ['testing', 'Vitest'],
    ]);

    const clashes = platformClashes(brief);

    expect(clashes.map((each) => each.question.id)).toEqual([
      `stack-clash.${id}.backend-framework`,
      `stack-clash.${id}.testing`,
    ]);
    expect(clashes[0]?.text).toContain('Fastify');
    expect(clashes[0]?.text).toContain('Node.js');
    expect(clashes[0]?.text).toContain('C# on .NET');
    expect(clashes[0]?.version).toBe(stack.rulesVersion);
  });

  it('RF-609 the default of each question is the platform recommended technology for the layer', () => {
    const brief = briefOf([
      ['language-runtime', 'C# on .NET'],
      ['backend-framework', 'Fastify'],
      ['testing', 'Vitest'],
    ]);

    const clashes = platformClashes(brief);

    expect(clashes[0]?.question.answer).toContain('ASP.NET Core Razor Pages');
    expect(clashes[1]?.question.answer).toContain('xUnit');
  });

  it('RF-609 flags a .NET data access library with Java and does not change the brief', () => {
    const brief = briefOf([
      ['language-runtime', 'Java'],
      ['data-access', 'Entity Framework Core 8'],
    ]);
    const before = JSON.stringify(brief);

    const clashes = platformClashes(brief);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]?.question.answer).toContain('Spring Data JPA');
    expect(JSON.stringify(brief)).toBe(before);
  });
});

describe('stackClashes: stacks with no platform clash (DEC-208)', () => {
  it('RF-609 a consistent stack gives no clash', () => {
    const brief = briefOf([
      ['language-runtime', 'C# on .NET'],
      ['backend-framework', 'ASP.NET Core MVC'],
      ['data-access', 'Dapper'],
      ['testing', 'xUnit'],
      ['database', 'PostgreSQL'],
      ['hosting', 'Docker containers'],
    ]);

    expect(platformClashes(brief)).toEqual([]);
  });

  it('RF-609 no clash without a language of a platform, or for a technology with no platform', () => {
    const noLanguage = briefOf([['backend-framework', 'Fastify']]);
    const unknownLanguage = briefOf([
      ['language-runtime', 'Go'],
      ['backend-framework', 'Fastify'],
    ]);
    const neutral = briefOf([
      ['language-runtime', 'C# on .NET'],
      ['front-end', 'React'],
    ]);

    for (const brief of [noLanguage, unknownLanguage, neutral]) {
      expect(platformClashes(brief)).toEqual([]);
    }
  });

  it('RF-609 a layer Rosetta proposed is not a clash of the owner choices', () => {
    const brief = briefOf(
      [
        ['language-runtime', 'C# on .NET'],
        ['backend-framework', 'Fastify'],
      ],
      true,
    );

    expect(platformClashes(brief)).toEqual([]);
  });
});
