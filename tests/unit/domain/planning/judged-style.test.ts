import { describe, expect, it } from 'vitest';
import { briefDecisions } from '../../../../src/domain/planning/brief-decisions.js';
import {
  judgedStyleId,
  namedStyleId,
  styleReferenceKind,
} from '../../../../src/domain/planning/judged-style.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P8-09, EV-73, RF-608, DEC-184: the style a typed architecture answer is judged against. The text
// names a style by whole words, and a refusal ("not layered") names nothing.

const styles = shippedCatalogue.styles;

function briefFor(text: string, recommended?: BriefAnswers['architecture']) {
  return buildBrief(
    {
      architecture: recommended ?? { style: 'layered', recommended: ['hexagonal', 'clean'] },
      typed: { architecture: text },
    },
    shippedCatalogue,
  );
}

describe('judgedStyleId with a typed architecture', () => {
  it('P8-09 names a style by its whole words', () => {
    expect(judgedStyleId(briefFor('We want a modular monolith.'), styles)).toBe('modular-monolith');
    expect(judgedStyleId(briefFor('Ports and adapters'), styles)).toBe('hexagonal');
    expect(judgedStyleId(briefFor('Go with Clean Architecture'), styles)).toBe('clean');
  });

  it('P8-09 "clean separation" is not Clean Architecture and picks nothing', () => {
    const brief = briefFor('Keep a clean separation of the modules');

    expect(namedStyleId(brief, styles)).toBeUndefined();
    expect(judgedStyleId(brief, styles)).toBe('hexagonal');
  });

  it('P8-09 "not layered" picks nothing, and a word that only contains a name is no name', () => {
    expect(namedStyleId(briefFor('We are not layered at all'), styles)).toBeUndefined();
    expect(namedStyleId(briefFor('instead of microservices'), styles)).toBeUndefined();
    expect(namedStyleId(briefFor('multilayered cells'), styles)).toBeUndefined();
    expect(namedStyleId(briefFor('not layered but event-driven'), styles)).toBeUndefined();
  });
});

const refused = [
  'layered, no exceptions',
  'not layered but event-driven',
  'not layered, event-driven',
  'we were on layered but want clean',
  'we are not happy with microservices, so layered',
  "we don't like slow builds but use layered",
  'layered? no',
  'go with layered... not',
  'layered;no',
  'I want layered ... not really',
  'layered, to be replaced',
  'layered and hexagonal',
  'we do not use layered',
  "don't use layered",
  'we dont want layered',
  'isnt layered',
  'nothing layered',
  'sin layered',
  'layered no longer',
  'layered anymore',
  'we moved away from layered',
  'we replaced layered with cells',
  'dropped layered last year',
  'instead of layered',
  'layered is no good',
  'layered is not what we want',
  'layered is bad',
  'layered did not work',
  'anything but layered',
  'anything except layered',
  'other than layered',
  'we dislike layered',
  'we hate layered',
  'we reject layered',
  'we stopped using layered',
  'we left layered behind',
  'tired of layered',
  'layered with no shared kernel',
  'a pre-layered design',
  'layered or hexagonal',
  'three layers',
  'several microservices',
];

const chosen = [
  ['layered', 'layered'],
  ['Layered please', 'layered'],
  ['we want layered', 'layered'],
  ['go with clean architecture', 'clean'],
  ['microservice', 'microservices'],
  ['Microservices', 'microservices'],
  ['the layers', 'layered'],
  ['event driven', 'event-driven'],
  ['Event-driven', 'event-driven'],
  ['Ports and adapters', 'hexagonal'],
] as const;

describe('judgedStyleId: only a plain answer chooses a style (P8-09)', () => {
  it.each(refused)('names no style in %j', (text) => {
    expect(namedStyleId(briefFor(text), styles)).toBeUndefined();
  });

  it.each(chosen)('names the style of %j', (text, id) => {
    expect(namedStyleId(briefFor(text), styles)).toBe(id);
  });
});

describe('styleReferenceKind', () => {
  const layered = { id: 'layered', title: 'Layered (N-tier)' } as const;
  const hexagonal = { id: 'hexagonal', title: 'Hexagonal (ports and adapters)' } as const;

  it('P8-09 names the style the answer names, the recommended style or the default, truly', () => {
    expect(styleReferenceKind(briefFor('a layered design'), layered)).toBe(
      'the catalogue style the answer names',
    );
    expect(styleReferenceKind(briefFor('cells per region'), hexagonal)).toBe(
      'the style Rosetta recommended',
    );
    expect(styleReferenceKind(briefFor('cells per region'), layered)).toBe('the default style');
  });

  it('P8-09 the decision record words the fallback the same way', () => {
    const brief = { ...briefFor('Keep a clean separation'), savedAt: '2026-10-12T09:30:00.000Z' };
    const [record] = briefDecisions(
      brief,
      shippedCatalogue,
      { supported: new Set(), cards: [], tasks: [] },
      0,
    ).decisions;

    expect(record?.consequences).toContain('the style Rosetta recommended');
    expect(record?.consequences).not.toContain('closest to the answer');
    expect(record?.context).toContain('Rosetta recommended Hexagonal');
  });
});
