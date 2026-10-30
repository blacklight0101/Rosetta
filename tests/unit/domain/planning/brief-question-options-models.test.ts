import { describe, expect, it } from 'vitest';
import { briefQuestionOptions } from '../../../../src/domain/planning/brief-question-options.js';
import { buildBrief, type PlanningBrief } from '../../../../src/domain/planning/planning-brief.js';
import { resolveBuildMethod } from '../../../../src/domain/planning/build-method.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-639, RF-645, DEC-178, P7-12, EV-64, EV-77: a tier-model question the brief left blank lists
// suggested answers from the model map of the brief's tool, the tier's own model recommended first.

const briefOf = (buildMethod: object): PlanningBrief => ({
  ...buildBrief({ buildMethod: { aiAssisted: true, ...buildMethod } }, shippedCatalogue),
  savedAt: '2026-10-30T09:30:00.000Z',
});

const codexBlank = briefOf({ agentTool: { kind: 'codex' } });
const optionsOf = (brief: PlanningBrief, id: string) =>
  briefQuestionOptions(brief, shippedCatalogue)[id] ?? [];

describe('P7-12 the suggested answers of a blank tier-model question', () => {
  it('RF-645 a Codex brief with no typed names lists the middle and largest questions as defaulted', () => {
    expect(codexBlank.defaulted).toEqual(
      expect.arrayContaining(['buildMethod.models.middle', 'buildMethod.models.largest']),
    );
  });

  it('RF-645 each blank Codex tier question lists at least three suggested answers', () => {
    for (const tier of ['smallest', 'middle', 'largest']) {
      expect(optionsOf(codexBlank, `buildMethod.models.${tier}`).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('RF-645 the tier own model is recommended and first, and only it is recommended', () => {
    const resolved = resolveBuildMethod({ aiAssisted: true, agentTool: { kind: 'codex' } });
    for (const tier of ['smallest', 'middle', 'largest'] as const) {
      const options = optionsOf(codexBlank, `buildMethod.models.${tier}`);

      expect(options[0]?.answer).toBe(resolved.models?.[tier]);
      expect(options[0]?.recommended).toBe(true);
      expect(options.filter((option) => option.recommended)).toHaveLength(1);
    }
  });

  it('RF-645 the other tiers models follow as alternatives, each once and with a description', () => {
    const options = optionsOf(codexBlank, 'buildMethod.models.middle');
    const answers = options.map((option) => option.answer);

    expect(new Set(answers).size).toBe(answers.length);
    for (const option of options) expect(option.description.length).toBeGreaterThan(10);
  });
});

describe('P7-12 the options of other tools and of named tiers', () => {
  it('RF-645 Claude Code takes its options from its own map, haiku, sonnet and opus', () => {
    const brief = briefOf({ agentTool: { kind: 'claude-code' } });
    const answers = optionsOf(brief, 'buildMethod.models.middle').map((o) => o.answer);

    expect(answers[0]).toBe('sonnet');
    expect(answers).toEqual(expect.arrayContaining(['haiku', 'opus']));
  });

  it('RF-645 another tool has no model map, so its tier questions list no suggested answers', () => {
    const brief = briefOf({ agentTool: { kind: 'other', name: 'Custom' } });

    expect(optionsOf(brief, 'buildMethod.models.middle')).toEqual([]);
  });

  it('RF-645 a tier the team named is not a defaulted question and has no options', () => {
    const brief = briefOf({ agentTool: { kind: 'codex' }, models: { middle: 'gpt-mid' } });

    expect(optionsOf(brief, 'buildMethod.models.middle')).toEqual([]);
  });
});

describe('P7-12 a Codex brief with no typed names gets the offered names', () => {
  it('RF-639 resolves a model for each of the three tiers and none for the escalation', () => {
    const method = resolveBuildMethod({ aiAssisted: true, agentTool: { kind: 'codex' } });

    expect(Object.keys(method.models ?? {}).sort()).toEqual(['largest', 'middle', 'smallest']);
  });

  it('RF-639 a typed name wins over the offered one', () => {
    const method = resolveBuildMethod({
      aiAssisted: true,
      agentTool: { kind: 'codex' },
      models: { middle: 'gpt-mid' },
    });

    expect(method.models?.middle).toBe('gpt-mid');
    expect(method.models?.smallest).toBeDefined();
  });

  it('RF-639 another tool is still given no names', () => {
    const method = resolveBuildMethod({
      aiAssisted: true,
      agentTool: { kind: 'other', name: 'Custom' },
    });

    expect(method.models).toBeUndefined();
  });
});
