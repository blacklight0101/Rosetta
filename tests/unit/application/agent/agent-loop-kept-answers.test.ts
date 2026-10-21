import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { needsRetry } from '../../../../src/application/understand/task-retry.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import type { TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import { toolsOver } from '../../../support/area-tools.js';
import { cardObject } from '../../../support/card-output.js';
import {
  loopSetup,
  textTurn,
  toolTurn,
  usage,
  type Call,
} from '../../../support/agent-loop-harness.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-206, Q-50, Q-55, P3-83: a refused answer keeps its cards. The Q-50 refusal is given only when
// the conversation has room for one more read and a new answer; an answer refused earlier is read
// as the final answer when the task ends before another one arrives. Synthetic shapes of a live
// run (a long answer after reads on a 32,768-token context).

/** An area of 30,000 first-party tokens; reading `wb/workbook.md` alone is 3% of it. */
const files: readonly FileEntry[] = [
  entry('wb/workbook.md', 1000),
  entry('wb/Sheet1/values.md', 20000),
  entry('wb/Sheet1/formulas.md', 3000),
  entry('wb/Sheet2/formulas.md', 1000),
  entry('wb/macros/Module1.bas', 900),
  entry('wb/Sheet1/notes.md', 2100),
  entry('wb/Sheet1/validation.md', 2000),
];

const read = (path: string): Call => ({ name: 'read_file', args: { path } });
const tokens = (inputTokens: number, outputTokens = 0): TokenUsage => ({
  ...usage,
  inputTokens,
  outputTokens,
});

function over(
  outcomes: readonly ScenarioOutcome[],
  settings: Parameters<typeof loopSetup>[1] = {},
) {
  const setup = loopSetup(outcomes, settings);
  const notes: unknown[] = [];
  const run = () =>
    runAgentTask({
      ...setup.request(setup.fake),
      tools: toolsOver(files),
      onNote: (note) => {
        notes.push(note);
        return Promise.resolve();
      },
    });
  return { ...setup, notes, run };
}

/** A 1,000-character answer in the shape of the live Invoice answer, only shorter. */
const longAnswer = JSON.stringify({
  cards: [
    cardObject({
      title: 'Invoice rules',
      summary: 'x'.repeat(900),
      claims: [{ text: 'It adds tax.', citations: ['wb/Sheet1/formulas.md:1-3'] }],
    }),
  ],
});

describe('P3-83 the refusal is given only with room for one more read and an answer', () => {
  it('Q-55 the recorded Invoice shape: reads, a long answer, context at the share: no refusal, cards kept, no retry', async () => {
    const t = over(
      [
        toolTurn([read('wb/workbook.md')], tokens(20_000)),
        textTurn(longAnswer, tokens(26_000, 2_500)),
      ],
      { contextTokens: 32_768, maxTurns: 6 },
    );

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.reason).toBe('final-answer');
    expect(needsRetry(result)).toBe(false);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Invoice rules']);
    expect(t.fake.requests).toHaveLength(2);
    expect(t.notes).toEqual([{ outcome: 'accepted', reason: 'no-room' }]);
    const line = t.logger.entries.find((each) => each.message === 'An agent answer was accepted.');
    expect(line?.data).toEqual({ outcome: 'accepted', reason: 'no-room' });
    expect(line?.agentTaskId).toBe('task-orders');
    expect(t.logger.text()).not.toContain('Invoice rules');
  });

  it('Q-50 a refusal with room left reads more, and the second answer is accepted (as P3-78)', async () => {
    const t = over([
      toolTurn([read('wb/workbook.md')]),
      textTurn(shippingCards),
      toolTurn([read('wb/Sheet1/formulas.md')]),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(4);
    expect(t.notes).toEqual([{ outcome: 'refused', reason: 'read-little' }]);
  });

  it('RF-206 an answer before any read is refused even when there is no room (unchanged)', async () => {
    const t = over([textTurn(shippingCards, tokens(17_500)), textTurn(shippingCards)], {
      contextTokens: 24_000,
    });

    await t.run();

    expect(t.fake.requests[1]?.messages.at(-1)?.content).toContain('You have read no file');
    expect(t.notes[0]).toEqual({ outcome: 'refused', reason: 'not-read' });
  });
});

describe('the room needed is the answer plus 4,000 tokens for one read', () => {
  const answerTokens = Math.ceil(shippingCards.length / 4);
  const roomy = (missing: number) =>
    over(
      [
        toolTurn([read('wb/workbook.md')]),
        textTurn(shippingCards, tokens(8_000 - answerTokens - 4_000 + missing)),
        textTurn(shippingCards),
      ],
      { contextTokens: 10_000 },
    );

  it('Q-55 refuses when the free room is exactly the answer plus one read', async () => {
    const t = roomy(0);

    const result = await t.run();

    expect(result.turns).toBe(3);
    expect(t.notes).toEqual([{ outcome: 'refused', reason: 'read-little' }]);
  });

  it('Q-55 accepts the answer when the free room is one token short', async () => {
    const t = roomy(1);

    const result = await t.run();

    expect(result.turns).toBe(2);
    expect(t.notes).toEqual([{ outcome: 'accepted', reason: 'no-room' }]);
  });
});

describe('P3-83 a refused answer is read as the final answer when the task ends', () => {
  it('Q-55 a refusal followed by a turn over the context share keeps the first answer (read first)', async () => {
    const t = over([textTurn(shippingCards, tokens(26_200)), textTurn(shippingCards)], {
      contextTokens: 32_768,
    });

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(t.fake.requests).toHaveLength(1);
    expect(t.notes).toEqual([
      { outcome: 'refused', reason: 'not-read' },
      { outcome: 'kept', reason: 'context-limit' },
    ]);
  });

  it('Q-55 a read-more refusal followed by reads that fill the context keeps the first answer', async () => {
    const t = over([
      toolTurn([read('wb/workbook.md')]),
      textTurn(shippingCards),
      toolTurn([read('wb/Sheet1/formulas.md')], tokens(80_000)),
    ]);

    const result = await t.run();

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(result.reason).toBe('final-answer');
    expect(t.notes).toEqual([
      { outcome: 'refused', reason: 'read-little' },
      { outcome: 'kept', reason: 'context-limit' },
    ]);
  });
});

describe('P3-83 a refused answer and the turn limit', () => {
  it('Q-55 a refusal followed by the turn limit keeps the first answer', async () => {
    const t = over(
      [
        toolTurn([read('wb/workbook.md')]),
        textTurn(shippingCards),
        toolTurn([read('wb/Sheet1/formulas.md')]),
        toolTurn([read('wb/Sheet2/formulas.md')]),
      ],
      { maxTurns: 4 },
    );

    const result = await t.run();

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(result.turns).toBe(4);
    expect(t.notes).toEqual([
      { outcome: 'refused', reason: 'read-little' },
      { outcome: 'kept', reason: 'max-turns' },
    ]);
  });
});

describe('P3-83 a refused answer and what follows it', () => {
  it('Q-55 a refusal followed by a failed call is not kept: only a context or turn end keeps it', async () => {
    const t = over([toolTurn([read('wb/workbook.md')]), textTurn(shippingCards)]);

    const result = await t.run();

    expect(result.reason).toBe('provider-failed');
    expect(result.drafts).toEqual([]);
    expect(t.notes).toEqual([{ outcome: 'refused', reason: 'read-little' }]);
  });

  it('RF-208 a task that ends with no refused answer behind it still ends as before', async () => {
    const t = over(
      [toolTurn([read('wb/workbook.md')]), toolTurn([read('wb/Sheet2/formulas.md')])],
      { maxTurns: 2 },
    );

    const result = await t.run();

    expect(result.reason).toBe('max-turns');
    expect(result.drafts).toEqual([]);
    expect(t.notes).toEqual([]);
  });

  it('Q-55 a later answer replaces the refused one', async () => {
    const t = over([
      toolTurn([read('wb/workbook.md')]),
      textTurn(longAnswer),
      toolTurn([read('wb/Sheet1/formulas.md')]),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(t.notes.at(-1)).toEqual({ outcome: 'refused', reason: 'read-little' });
  });
});
