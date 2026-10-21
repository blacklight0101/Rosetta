import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { cardObject } from '../../../support/card-output.js';
import { textTurn, ungatedLoopSetup, usage } from '../../../support/agent-loop-harness.js';

// RF-202, RF-208, Q-55, P3-83: an answer cut off at the output limit whose continuation cannot be
// asked keeps every complete card and open question; the cut card is recorded as invalid output.
// With room the continuation is asked as before. Synthetic shape of a live run: the second half's
// answer ended `finishReason: length` at 4,096 output tokens.

const checkout = cardObject({ title: 'Checkout' });
const rounding = cardObject({
  type: 'OQ',
  title: 'Tax rounding',
  question: 'Which rounding rule does finance want on invoice totals?',
  whyItMatters: 'The totals differ by a cent between the lines and the sum.',
});
const mailer = cardObject({
  title: 'Mailer',
  claims: [{ text: 'It sends a mail after the order.', citations: ['src/Orders/Mailer.cs:3-9'] }],
});

const whole = JSON.stringify({ cards: [checkout, rounding, mailer] });
/** The answer as the model left it: two complete cards, the third cut inside its claim. */
const cut = whole.slice(0, whole.indexOf('after the order') + 5);

function cutTurn(text: string, turnUsage: TokenUsage = usage): ScenarioOutcome {
  return {
    response: { text, toolCalls: [], usage: turnUsage, finishReason: 'length' },
    retried: [],
  };
}

describe('P3-83 an answer cut off whose continuation cannot be asked', () => {
  it('Q-55 at the turn limit: the complete cards and the open question are kept, the cut card is invalid output', async () => {
    const notes: unknown[] = [];
    const { fake, request } = ungatedLoopSetup([cutTurn(cut)], { maxTurns: 1 });

    const result = await runAgentTask({
      ...request(fake),
      onNote: (note) => {
        notes.push(note);
        return Promise.resolve();
      },
    });

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
    expect(result.drafts.map((draft) => draft.type)).toEqual(['FEAT', 'OQ']);
    expect(result.problems.map((problem) => problem.path)).toEqual(['cards.2']);
    expect(result.problems[0]?.message).toContain('cut off');
    expect(result.rawOutputs).toEqual([cut]);
    expect(fake.requests).toHaveLength(1);
    expect(notes).toEqual([{ outcome: 'cut', reason: 'max-turns' }]);
  });

  it('Q-55 over the context share: the complete cards are kept', async () => {
    const { fake, request } = ungatedLoopSetup(
      [cutTurn(cut, { ...usage, inputTokens: 90_000, outputTokens: 4_096 })],
      { contextTokens: 100_000 },
    );

    const result = await runAgentTask(request(fake));

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
    expect(result.reason).toBe('context-limit');
    expect(fake.requests).toHaveLength(1);
  });

  it('Q-55 a cut with no complete card in it keeps nothing and ends as before', async () => {
    const { fake, request } = ungatedLoopSetup([cutTurn('{"cards": [{"type": "FEAT", "tit')], {
      maxTurns: 1,
    });

    const result = await runAgentTask(request(fake));

    expect(result.drafts).toEqual([]);
    expect(result.problems.map((problem) => problem.path)).toEqual(['']);
    expect(result.reason).toBe('max-turns');
  });
});

describe('P3-83 an answer cut off with nothing to keep', () => {
  it('Q-55 a cut after a complete card with no valid claim keeps nothing and notes nothing', async () => {
    const bad = cardObject({ title: 'Broken', claims: [{ text: 'x', citations: ['nowhere'] }] });
    const text = `${JSON.stringify({ cards: [bad] }).slice(0, -2)},{"type":"FE`;
    const notes: unknown[] = [];
    const { fake, request } = ungatedLoopSetup([cutTurn(text)], { maxTurns: 1 });

    const result = await runAgentTask({
      ...request(fake),
      onNote: (note) => {
        notes.push(note);
        return Promise.resolve();
      },
    });

    expect(result.drafts).toEqual([]);
    expect(result.reason).toBe('max-turns');
    expect(notes).toEqual([]);
  });

  it('Q-55 a cut in prose with no card list in it keeps nothing', async () => {
    const text = 'The cards are {"type": "FEAT", "title": "Check';
    const { fake, request } = ungatedLoopSetup([cutTurn(text)], { maxTurns: 1 });

    const result = await runAgentTask(request(fake));

    expect(result.drafts).toEqual([]);
    expect(result.problems.map((problem) => problem.path)).toEqual(['']);
  });
});

describe('P3-83 an answer cut off inside prose or beside a bad card', () => {
  it('Q-55 a cut inside prose and a code fence keeps the complete cards, too', async () => {
    const fenced = `Here are the cards.\n\`\`\`json\n${cut}`;
    const { fake, request } = ungatedLoopSetup([cutTurn(fenced)], { maxTurns: 1 });

    const result = await runAgentTask(request(fake));

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
  });

  it('Q-55 a complete card whose claim is invalid is dropped and listed, the others kept', async () => {
    const bad = cardObject({ title: 'Broken', claims: [{ text: 'x', citations: ['nowhere'] }] });
    const text = `${JSON.stringify({ cards: [checkout, bad, rounding] }).slice(0, -2)},{"type":"FE`;
    const { fake, request } = ungatedLoopSetup([cutTurn(text)], { maxTurns: 1 });

    const result = await runAgentTask(request(fake));

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
    expect(result.problems.some((problem) => problem.path.startsWith('cards.1'))).toBe(true);
    expect(result.problems.some((problem) => problem.message.includes('cut off'))).toBe(true);
  });
});

describe('P3-83 an answer still cut off when the follow-ups are used up', () => {
  it('Q-55 two continuations and two repairs that stay cut: the finished cards are kept, nothing is stopped', async () => {
    const notes: unknown[] = [];
    const { fake, request } = ungatedLoopSetup(
      [cutTurn(cut), cutTurn(' and'), cutTurn(' more'), cutTurn(cut), cutTurn(cut)],
      { maxTurns: 12 },
    );

    const result = await runAgentTask({
      ...request(fake),
      onNote: (note) => {
        notes.push(note);
        return Promise.resolve();
      },
    });

    expect(fake.requests).toHaveLength(5);
    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
    expect(notes).toEqual([{ outcome: 'cut', reason: 'unfinished' }]);
  });
});

describe('P3-83 an answer cut off with room to continue', () => {
  it('RF-208 the continuation is asked as today and nothing is noted', async () => {
    const notes: unknown[] = [];
    const { fake, request } = ungatedLoopSetup([cutTurn(cut), textTurn(whole.slice(cut.length))]);

    const result = await runAgentTask({
      ...request(fake),
      onNote: (note) => {
        notes.push(note);
        return Promise.resolve();
      },
    });

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual([
      'Checkout',
      'Tax rounding',
      'Mailer',
    ]);
    expect(result.problems).toEqual([]);
    expect(fake.requests).toHaveLength(2);
    expect(notes).toEqual([]);
  });
});
