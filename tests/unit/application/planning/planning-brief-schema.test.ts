import { describe, expect, it } from 'vitest';
import {
  parseBriefAnswers,
  parsePlanningBrief,
} from '../../../../src/application/planning/planning-brief-schema.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-605, data-model.md section 3.20: the shapes of planning-brief.json and of a save.

const saved = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T10:00:00.000Z' };

describe('parseBriefAnswers', () => {
  it('RF-605 an empty save is valid: every question takes its default', () => {
    expect(parseBriefAnswers({})).toEqual({});
  });

  it('RF-605 reads every part of a full save', () => {
    const body = {
      principles: ['tdd'],
      architecture: { style: 'clean', recommended: ['clean', 'hexagonal'], evidence: ['C-1'] },
      migration: 'parallel-change',
      stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
      context: { teamSize: 5, experience: 'Mixed', deadline: 'Q3', keepIntegrations: ['SAP'] },
      buildMethod: { aiAssisted: true },
    };

    expect(parseBriefAnswers(body)).toMatchObject(body);
  });

  it.each([
    ['an unknown key', { extra: 1 }],
    ['an unknown migration strategy', { migration: 'big-bang' }],
    ['an unknown style', { architecture: { style: 'spaghetti' } }],
    ['an unknown layer', { stack: [{ layer: 'cache', choice: 'Redis', custom: false }] }],
    ['an empty choice', { stack: [{ layer: 'testing', choice: ' ', custom: false }] }],
    [
      'a choice over 200 characters',
      { stack: [{ layer: 'testing', choice: 'x'.repeat(201), custom: true }] },
    ],
    ['a team of zero', { context: { teamSize: 0 } }],
    ['a fractional team', { context: { teamSize: 2.5 } }],
    ['a text over 500 characters', { context: { deadline: 'x'.repeat(501) } }],
    [
      'more than 20 integrations',
      { context: { keepIntegrations: Array.from({ length: 21 }, () => 'a') } },
    ],
    ['an unknown context key', { context: { budget: 1 } }],
    ['a build method that is not a boolean', { buildMethod: { aiAssisted: 'yes' } }],
    ['a non-object body', 'text'],
  ])('RF-605 refuses %s', (_name, body) => {
    expect(parseBriefAnswers(body)).toBeUndefined();
  });
});

describe('parsePlanningBrief', () => {
  it('RF-605 reads a brief it wrote', () => {
    expect(parsePlanningBrief(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('RF-605 refuses another schema version', () => {
    expect(parsePlanningBrief({ ...saved, schemaVersion: 2 })).toBeUndefined();
  });

  it('RF-605 refuses a brief without its save instant or with a loose one', () => {
    expect(parsePlanningBrief({ ...saved, savedAt: undefined })).toBeUndefined();
    expect(parsePlanningBrief({ ...saved, savedAt: 'yesterday' })).toBeUndefined();
  });

  it('RF-605 refuses a field the file should not hold', () => {
    expect(parsePlanningBrief({ ...saved, apiKey: 'x' })).toBeUndefined();
  });
});

describe('the options offered with a stack choice', () => {
  const stack = [
    {
      layer: 'database',
      choice: 'PostgreSQL 17',
      custom: false,
      offered: ['SQL Server', 'PostgreSQL 17'],
    },
  ];

  it('RF-609 a save and a stored brief keep the options offered', () => {
    expect(parseBriefAnswers({ stack })?.stack).toEqual(stack);
    expect(parsePlanningBrief({ ...saved, stack })?.stack).toEqual(stack);
  });

  it('RF-609 a brief saved without them is still valid, and too many are refused', () => {
    const plain = [{ layer: 'database', choice: 'PostgreSQL', custom: true }];
    expect(parsePlanningBrief({ ...saved, stack: plain })).toBeDefined();
    const many = [{ ...plain[0], offered: ['a', 'b', 'c', 'd', 'e', 'f'] }];
    expect(parseBriefAnswers({ stack: many })).toBeUndefined();
  });
});

describe('the kind of application (P5-39)', () => {
  it('RF-609 a save and a stored brief may hold the kind of application', () => {
    expect(parseBriefAnswers({ application: 'desktop' })).toEqual({ application: 'desktop' });
    expect(parsePlanningBrief({ ...saved, application: 'service' })?.application).toBe('service');
  });

  it('RF-609 an unknown kind is refused', () => {
    expect(parseBriefAnswers({ application: 'mainframe' })).toBeUndefined();
  });

  it('RF-609 an owner can never save a choice as proposed by Rosetta', () => {
    const stack = [{ layer: 'testing', choice: 'xUnit', custom: false, proposed: true }];
    expect(parseBriefAnswers({ stack })).toBeUndefined();
  });
});
