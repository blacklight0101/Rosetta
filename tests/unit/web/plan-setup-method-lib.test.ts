import { describe, expect, it } from 'vitest';
import { briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import {
  agentToolNamedIn,
  buildMethodOf,
  methodLineOf,
  modelExample,
} from '../../../web/src/lib/plan-setup/build-method.js';
import {
  answersOf,
  draftOf,
  problemsOf,
  shownMethod,
  withAnswered,
} from '../../../web/src/lib/plan-setup/draft.js';
import { recordedLines } from '../../../web/src/lib/plan-setup/recorded.js';
import { catalogue, savedBrief, unsavedBrief } from './plan-setup-fixtures.js';

// RF-612, RF-639, DEC-176 (Q-A, Q-B): the build method in the draft of Plan setup: what a save sends
// (the tool and the named models, never a model the person did not name), the tool the project
// context names and the line of "What I recorded".

const view = (buildMethod: unknown, defaulted: string[]) =>
  briefViewSchema.parse({
    ...savedBrief,
    brief: { ...savedBrief.brief, buildMethod, defaulted },
  });

const unanswered = draftOf(briefViewSchema.parse(unsavedBrief).brief);

describe('draft of the build method', () => {
  it('RF-612 an old saved brief with only the yes or no loads as agents with no tool', () => {
    expect(draftOf(view({ aiAssisted: true }, []).brief)).toMatchObject({
      aiAssisted: true,
      toolKind: '',
    });
  });
  it('RF-612 a brief on its defaults has no answer and sends no build method', () => {
    expect(unanswered.aiAssisted).toBe(false);
    expect(unanswered.answered).not.toContain('buildMethod');
    expect(answersOf(unanswered)).toEqual({});
  });

  it('RF-639 a saved tool and its named models are sent again, not only the yes or no', () => {
    const saved = view(
      {
        aiAssisted: true,
        agentTool: { kind: 'codex' },
        models: { middle: 'gpt-mid', escalation: 'gpt-top' },
      },
      ['buildMethod.models.smallest', 'buildMethod.models.largest'],
    );

    const draft = draftOf(saved.brief);

    expect(answersOf(draft).buildMethod).toEqual({
      aiAssisted: true,
      agentTool: { kind: 'codex' },
      models: { middle: 'gpt-mid', escalation: 'gpt-top' },
    });
  });

  it('RF-639 a Claude Code alias the person did not name is not sent as if named', () => {
    const saved = view(
      {
        aiAssisted: true,
        agentTool: { kind: 'claude-code' },
        models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
      },
      ['buildMethod.models.smallest', 'buildMethod.models.middle', 'buildMethod.models.largest'],
    );

    expect(answersOf(draftOf(saved.brief)).buildMethod).toEqual({
      aiAssisted: true,
      agentTool: { kind: 'claude-code' },
    });
  });
});

describe('draft of the build method: what is never sent', () => {
  it('RF-639 models typed without a tool are never sent', () => {
    const draft = withAnswered(
      { ...unanswered, aiAssisted: true, models: { ...unanswered.models, middle: 'gpt-mid' } },
      ['buildMethod'],
    );

    expect(answersOf(draft).buildMethod).toEqual({ aiAssisted: true });
  });

  it('RF-639 another tool is sent with its name, and without a name it is not sent', () => {
    const named = withAnswered(
      { ...unanswered, aiAssisted: true, toolKind: 'other' as const, toolName: ' Aider ' },
      ['buildMethod'],
    );
    const blank = { ...named, toolName: '  ' };

    expect(answersOf(named).buildMethod?.agentTool).toEqual({ kind: 'other', name: 'Aider' });
    expect(answersOf(blank).buildMethod).toEqual({ aiAssisted: true });
  });

  it('RF-612 people building send no tool and no model', () => {
    const draft = withAnswered(
      {
        ...unanswered,
        aiAssisted: false,
        toolKind: 'codex' as const,
        models: { ...unanswered.models, middle: 'x' },
      },
      ['buildMethod'],
    );

    expect(answersOf(draft).buildMethod).toEqual({ aiAssisted: false });
  });

  it('RF-639 names a model name that is too long', () => {
    const draft = { ...unanswered, models: { ...unanswered.models, largest: 'm'.repeat(81) } };

    expect(Object.keys(problemsOf(draft))).toEqual(['buildMethod.models.largest']);
  });
});

describe('the agent tool the project context names', () => {
  it.each([
    ['We build with Claude Code on every card', { kind: 'claude-code' }],
    ['the team uses OpenAI Codex', { kind: 'codex' }],
    ['GitHub Copilot agent for the small fixes', { kind: 'other', name: 'Copilot agent' }],
  ])('RF-612 reads %s', (text, expected) => {
    expect(agentToolNamedIn({ experience: text })).toEqual(expected);
  });

  it('RF-612 finds nothing in a context that names no agent tool', () => {
    expect(
      agentToolNamedIn({ experience: 'Ten years of .NET', deadline: 'March' }),
    ).toBeUndefined();
  });

  it('RF-612 opens on agents with the named tool while the question is unanswered', () => {
    const named = { ...unanswered, context: { ...unanswered.context, experience: 'Claude Code' } };

    const shown = shownMethod(named);

    expect(shown.aiAssisted).toBe(true);
    expect(shown.toolKind).toBe('claude-code');
    expect(answersOf(named)).toEqual({});
  });

  it('RF-612 keeps the answer once the person gave it', () => {
    const answered = withAnswered(
      { ...unanswered, context: { ...unanswered.context, experience: 'Claude Code' } },
      ['buildMethod'],
    );

    expect(shownMethod(answered).aiAssisted).toBe(false);
  });
});

const line = (draft: typeof unanswered) =>
  recordedLines(draft, catalogue).find((each) => each.key === 'Build method');

describe('the build method line of What I recorded', () => {
  it('RF-612 says the question is not answered and what the package then assumes', () => {
    expect(line(unanswered)).toEqual({
      key: 'Build method',
      value: 'not answered yet: the package assumes people will build',
      isDefault: true,
    });
  });

  it('RF-612 says people will build', () => {
    const draft = withAnswered(unanswered, ['buildMethod']);

    expect(line(draft)?.value).toBe('People will build');
    expect(line(draft)?.isDefault).toBe(false);
  });

  it('RF-639 names the tool and the model of each tier, with the Claude Code aliases', () => {
    const draft = withAnswered(
      { ...unanswered, aiAssisted: true, toolKind: 'claude-code' as const },
      ['buildMethod'],
    );

    expect(methodLineOf(draft)).toBe(
      'Agents will build with Claude Code. Models: smallest haiku, middle sonnet, largest opus',
    );
  });

  it('RF-639 names a model the person typed, and says which tier has none', () => {
    const draft = withAnswered(
      {
        ...unanswered,
        aiAssisted: true,
        toolKind: 'other' as const,
        toolName: 'Aider',
        models: { ...unanswered.models, middle: 'gpt-mid', escalation: 'gpt-top' },
      },
      ['buildMethod'],
    );

    expect(methodLineOf(draft)).toBe(
      'Agents will build with Aider. Models: middle gpt-mid; escalation gpt-top; no name for smallest, largest',
    );
  });
});

describe('the build method line of What I recorded: Codex defaults', () => {
  it('RF-639 P7-12 names the Codex tier models offered when the person types none', () => {
    const draft = withAnswered({ ...unanswered, aiAssisted: true, toolKind: 'codex' as const }, [
      'buildMethod',
    ]);

    expect(methodLineOf(draft)).toBe(
      'Agents will build with Codex. Models: smallest gpt-5-mini, middle gpt-5-codex, largest gpt-5',
    );
    expect(buildMethodOf(draft)).not.toHaveProperty('models');
    expect(modelExample('codex', 'largest')).toBe('gpt-5');
  });
});

describe('a typed build method on the page', () => {
  it('DEC-187 a typed build method is sent as text and never with a build method', () => {
    const draft = withAnswered(
      {
        ...unanswered,
        aiAssisted: true,
        toolKind: 'claude-code' as const,
        chosen: { buildMethod: 'typed' },
        typed: { buildMethod: 'Our own process' },
      },
      ['buildMethod'],
    );

    const answers = answersOf(draft);

    expect(answers).not.toHaveProperty('buildMethod');
    expect(answers.typed).toEqual({ buildMethod: 'Our own process' });
  });
});

describe('the build method line when the tool is open', () => {
  it('RF-612 says the tool is not chosen yet when agents build and no tool is chosen', () => {
    const draft = withAnswered({ ...unanswered, aiAssisted: true }, ['buildMethod']);

    expect(methodLineOf(draft)).toBe('Agents will build; tool not chosen yet');
  });
  it('RF-639 another tool without a name records no tool and no model, as the save sends none', () => {
    const draft = withAnswered(
      {
        ...unanswered,
        aiAssisted: true,
        toolKind: 'other' as const,
        toolName: ' ',
        models: { ...unanswered.models, middle: 'aider-mid' },
      },
      ['buildMethod'],
    );

    expect(answersOf(draft).buildMethod).toEqual({ aiAssisted: true });
    expect(methodLineOf(draft)).toBe('Agents will build; the other tool has no name yet');
  });
});
