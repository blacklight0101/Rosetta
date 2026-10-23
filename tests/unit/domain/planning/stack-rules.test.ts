import { describe, expect, it } from 'vitest';
import { noApiContract } from '../../../../src/domain/planning/api-contract.js';
import { keepLegacyDefault } from '../../../../src/domain/planning/legacy-default.js';
import {
  stackClashes,
  stackRules,
  stackRulesVersion,
} from '../../../../src/domain/planning/stack-rules.js';
import {
  buildBrief,
  type PlanningBrief,
  type StackLayer,
} from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609, DEC-80, DEC-135: the stack consistency check. A small versioned rule table compares the
// owner's choices of the planning brief (and whether an API contract applies) and reports each clash
// with a question whose default keeps the legacy behaviour; it never changes a choice.

const contract = { kind: 'openapi', operations: [], unserved: [] } as const;
const none = noApiContract('Razor Pages is rendered by the server.');

function briefOf(frontEnd: string | null, backEnd: string | null): PlanningBrief {
  const pick = (layer: StackLayer, choice: string | null) =>
    choice === null ? [] : [{ layer, choice, custom: false }];
  const stack = [...pick('backend-framework', backEnd), ...pick('front-end', frontEnd)];
  return { ...buildBrief({ stack }, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
}

describe('stackClashes: the rule table', () => {
  it('RF-609 is versioned and every rule has an id, a clash text, a question and a legacy-keeping default', () => {
    expect(stackRulesVersion).toBe(1);
    expect(new Set(stackRules.map((rule) => rule.id)).size).toBe(stackRules.length);
    for (const rule of stackRules) {
      expect(rule.matches.length).toBeGreaterThan(0);
      expect(rule.clash).not.toBe('');
      expect(rule.question).not.toBe('');
      expect(rule.answer.startsWith(keepLegacyDefault)).toBe(true);
    }
  });
});

describe('stackClashes: the eShop brief', () => {
  const brief = briefOf('Razor Pages', 'ASP.NET Core Minimal APIs');

  it('RF-609 flags a server-rendered front end with an API-only back end once, naming both choices', () => {
    const clashes = stackClashes(brief, none);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]?.rule).toBe('server-rendered-front-end-with-api-back-end');
    expect(clashes[0]?.version).toBe(stackRulesVersion);
    expect(clashes[0]?.text).toContain('Razor Pages');
    expect(clashes[0]?.text).toContain('ASP.NET Core Minimal APIs');
    expect(clashes[0]?.question.id).toBe('stack-clash.server-rendered-front-end-with-api-back-end');
    expect(clashes[0]?.question.answer).toContain(keepLegacyDefault);
  });

  it('RF-609 does not change the choices of the brief', () => {
    const before = JSON.stringify(brief);
    stackClashes(brief, none);
    expect(JSON.stringify(brief)).toBe(before);
  });

  it('RF-609 a rule removed from the table hides its clash', () => {
    const without = stackRules.filter(
      (rule) => rule.id !== 'server-rendered-front-end-with-api-back-end',
    );
    expect(stackClashes(brief, none, without)).toEqual([]);
  });
});

describe('stackClashes: other briefs', () => {
  it('RF-609 flags an API-only back end behind a single-page front end when no contract applies', () => {
    const clashes = stackClashes(briefOf('React', 'ASP.NET Core Web API'), none);

    expect(clashes.map((each) => each.rule)).toEqual(['api-back-end-without-contract']);
  });

  it('RF-609 flags an API-only back end with no front end chosen and no contract', () => {
    const clashes = stackClashes(briefOf(null, 'FastAPI'), none);

    expect(clashes.map((each) => each.rule)).toEqual(['api-back-end-without-contract']);
  });

  it('RF-609 flags nothing for a consistent brief', () => {
    expect(stackClashes(briefOf('React', 'ASP.NET Core Web API'), contract)).toEqual([]);
    expect(stackClashes(briefOf('Razor Pages', 'ASP.NET Core MVC'), none)).toEqual([]);
    expect(stackClashes(briefOf('Razor Pages', null), none)).toEqual([]);
  });

  it('RF-609 flags nothing for a choice the table does not know', () => {
    expect(stackClashes(briefOf('Our own toolkit', 'In-house engine'), none)).toEqual([]);
  });

  it('RF-609 does not mistake JavaScript for Java', () => {
    expect(stackClashes(briefOf('Razor Pages', 'Express with JavaScript'), none)).toEqual([]);
  });
});
