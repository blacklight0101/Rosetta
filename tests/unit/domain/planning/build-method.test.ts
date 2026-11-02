import { describe, expect, it } from 'vitest';
import { defaultedQuestions } from '../../../../src/domain/planning/brief-questions.js';
import { modelForTier } from '../../../../src/domain/planning/build-method.js';
import { sameBrief } from '../../../../src/domain/planning/brief-freshness.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-612, RF-639, DEC-176 (Q-B): the agent tool and the model of each tier in the build method.

const at = '2026-10-28T09:00:00.000Z';
const tierIds = [
  'buildMethod.models.smallest',
  'buildMethod.models.middle',
  'buildMethod.models.largest',
];

function brief(buildMethod: NonNullable<BriefAnswers['buildMethod']>) {
  return buildBrief({ buildMethod }, shippedCatalogue);
}

describe('buildBrief: agent tool and models', () => {
  it('RF-639 Claude Code takes haiku, sonnet and opus when no model is named', () => {
    const built = brief({ aiAssisted: true, agentTool: { kind: 'claude-code' } });

    expect(built.buildMethod).toEqual({
      aiAssisted: true,
      agentTool: { kind: 'claude-code' },
      models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
    });
    expect(built.defaulted).toEqual(expect.arrayContaining(tierIds));
  });

  it('RF-639 another tool has no default model names', () => {
    const agentTool = { kind: 'other', name: 'Aider' } as const;
    const built = brief({ aiAssisted: true, agentTool });

    expect(built.buildMethod).toEqual({ aiAssisted: true, agentTool });
    expect(built.defaulted).toEqual(expect.arrayContaining(tierIds));
  });

  it('RF-639 a tier with no model name stays unnamed while the others keep theirs', () => {
    const built = brief({
      aiAssisted: true,
      agentTool: { kind: 'other', name: 'Aider' },
      models: { smallest: 'mini', largest: 'max' },
    });

    expect(built.buildMethod.models).toEqual({ smallest: 'mini', largest: 'max' });
    expect(built.defaulted).toContain('buildMethod.models.middle');
    expect(built.defaulted).not.toContain('buildMethod.models.smallest');
  });
});

describe('buildBrief: tool left out and the hash', () => {
  it('RF-639 a Claude Code model the team names replaces the default and is not defaulted', () => {
    const built = brief({
      aiAssisted: true,
      agentTool: { kind: 'claude-code' },
      models: { middle: 'sonnet-5', escalation: 'fable' },
    });

    expect(built.buildMethod.models).toEqual({
      smallest: 'haiku',
      middle: 'sonnet-5',
      largest: 'opus',
      escalation: 'fable',
    });
    expect(built.defaulted).not.toContain('buildMethod.models.middle');
    expect(built.defaulted).toContain('buildMethod.models.smallest');
  });

  it('RF-612 agents building with no tool named lists the tool as a defaulted question', () => {
    const built = brief({ aiAssisted: true });

    expect(built.buildMethod).toEqual({ aiAssisted: true });
    expect(built.defaulted).toContain('buildMethod.agentTool');
    expect(built.defaulted).not.toContain('buildMethod');
  });

  it('RF-612 people building keeps no tool and no model, whatever was sent', () => {
    const built = brief({
      aiAssisted: false,
      agentTool: { kind: 'claude-code' },
      models: { middle: 'sonnet' },
    });

    expect(built.buildMethod).toEqual({ aiAssisted: false });
    expect(built.defaulted.some((id) => id.startsWith('buildMethod.'))).toBe(false);
  });
});

describe('sameBrief: agent tool and models', () => {
  it('RF-639 the brief hash covers the tool and every model', () => {
    const codex = { aiAssisted: true, agentTool: { kind: 'codex' } } as const;
    const left = brief({ ...codex, models: { middle: 'a' } });
    const model = brief({ ...codex, models: { middle: 'b' } });
    const tool = brief({
      aiAssisted: true,
      agentTool: { kind: 'other', name: 'x' },
      models: { middle: 'a' },
    });

    expect(sameBrief(left, model)).toBe(false);
    expect(sameBrief(left, tool)).toBe(false);
    expect(sameBrief(left, brief({ ...codex, models: { middle: 'a' } }))).toBe(true);
  });
});

describe('defaultedQuestions: agent tool and models', () => {
  function questionsOf(buildMethod: NonNullable<BriefAnswers['buildMethod']>) {
    const saved = { ...brief(buildMethod), savedAt: at };
    return defaultedQuestions(saved, shippedCatalogue);
  }

  it('RF-639 says plainly what a missing tool leaves out', () => {
    const tool = questionsOf({ aiAssisted: true }).find(
      (question) => question.id === 'buildMethod.agentTool',
    );

    expect(tool?.question).toMatch(/agent tool/i);
    expect(tool?.answer).toMatch(/model/i);
    expect(tool?.answer).toMatch(/tier alone/i);
  });

  it('RF-639 names the Claude Code default of a tier', () => {
    const middle = questionsOf({ aiAssisted: true, agentTool: { kind: 'claude-code' } }).find(
      (question) => question.id === 'buildMethod.models.middle',
    );

    expect(middle?.question).toMatch(/middle/i);
    expect(middle?.answer).toContain('sonnet');
  });

  it('RF-639 P7-12 names the Codex default of a tier', () => {
    const largest = questionsOf({ aiAssisted: true, agentTool: { kind: 'codex' } }).find(
      (question) => question.id === 'buildMethod.models.largest',
    );

    expect(largest?.answer).toBe('The Codex default: gpt-5.');
  });

  it('RF-639 says a tier of another tool with no model shows the tier alone and is listed in checks.md', () => {
    const largest = questionsOf({
      aiAssisted: true,
      agentTool: { kind: 'other', name: 'Aider' },
    }).find((question) => question.id === 'buildMethod.models.largest');

    expect(largest?.answer).toMatch(/tier alone/i);
    expect(largest?.answer).toContain('checks.md');
  });
});

describe('modelForTier', () => {
  it('RF-639 names the model the build method gives the tier', () => {
    const method = { aiAssisted: true, models: { middle: 'sonnet', largest: 'opus' } } as const;

    expect(modelForTier(method, 'middle')).toBe('sonnet');
    expect(modelForTier(method, 'largest')).toBe('opus');
  });

  it('RF-639 a tier with no model, people building and no models name nothing', () => {
    expect(modelForTier({ aiAssisted: true, models: { middle: 'sonnet' } }, 'smallest')).toBe(
      undefined,
    );
    expect(modelForTier({ aiAssisted: true }, 'middle')).toBe(undefined);
    expect(modelForTier({ aiAssisted: false }, 'middle')).toBe(undefined);
  });
});
