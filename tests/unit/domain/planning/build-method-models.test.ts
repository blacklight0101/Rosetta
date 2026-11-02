import { describe, expect, it } from 'vitest';
import {
  modelMapOf,
  resolveBuildMethod,
  type AgentModelMaps,
} from '../../../../src/domain/planning/build-method.js';

// P7-23, RF-639, RF-645: the model map of a tool comes from the maps it is given, never from a literal.

const maps: AgentModelMaps = {
  claudeCode: { smallest: 'c-small', middle: 'c-mid', largest: 'c-big' },
  codex: { smallest: 'x-small', middle: 'x-mid', largest: 'x-big' },
};

describe('the model map of a tool', () => {
  it('RF-639 Claude Code and Codex take their names from the maps given', () => {
    expect(modelMapOf({ kind: 'claude-code' }, maps)).toEqual(maps.claudeCode);
    expect(modelMapOf({ kind: 'codex' }, maps)).toEqual(maps.codex);
  });

  it('RF-639 another tool has no map', () => {
    expect(modelMapOf({ kind: 'other', name: 'Aider' }, maps)).toBeUndefined();
    expect(modelMapOf(undefined, maps)).toBeUndefined();
  });

  it('RF-645 an unnamed tier is filled from the given map, a typed name wins', () => {
    const method = resolveBuildMethod(
      { aiAssisted: true, agentTool: { kind: 'codex' }, models: { middle: 'typed' } },
      maps,
    );

    expect(method.models).toEqual({ smallest: 'x-small', middle: 'typed', largest: 'x-big' });
  });
});
