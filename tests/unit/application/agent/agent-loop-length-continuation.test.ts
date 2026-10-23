import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { cardObject } from '../../../support/card-output.js';
import { textTurn, ungatedLoopSetup, usage } from '../../../support/agent-loop-harness.js';

// P5-03, RF-206, RF-208, Q-55, EV-20: a reader answer that stopped on the output limit
// (finishReason `length`) is asked to continue once, and the joined answer is read. A second cut
// goes to the existing repair path. Synthetic shapes of the 2026-10-22 local run: the answer ended
// at 4,096 output tokens right after a complete card, so complete card objects sat inside JSON
// that was never closed. Only the fake provider; no real call.

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
/** Cut right after the second complete card: the rest of the list is missing. */
const afterCard = whole.slice(0, whole.indexOf(',{', whole.indexOf('Tax rounding')) + 1);
/** Cut inside the third card's claim. */
const inCard = whole.slice(0, whole.indexOf('after the order') + 5);

const titles = (drafts: readonly { title: string }[]): string[] =>
  drafts.map((draft) => draft.title);

function cutTurn(text: string, turnUsage: TokenUsage = usage): ScenarioOutcome {
  return {
    response: { text, toolCalls: [], usage: turnUsage, finishReason: 'length' },
    retried: [],
  };
}

const continueAsk = 'Continue where you stopped.';

describe('P5-03 a cut answer is continued once', () => {
  it('RF-208 a length stop right after a complete card is continued and the joined answer parses', async () => {
    const { fake, request } = ungatedLoopSetup([
      cutTurn(afterCard),
      textTurn(whole.slice(afterCard.length)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding', 'Mailer']);
    expect(result.problems).toEqual([]);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.messages.at(-1)?.content).toBe(continueAsk);
  });

  it('RF-208 a length stop inside a card is continued and the joined answer parses', async () => {
    const { fake, request } = ungatedLoopSetup([
      cutTurn(inCard),
      textTurn(whole.slice(inCard.length)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding', 'Mailer']);
    expect(fake.requests).toHaveLength(2);
  });

  it('RF-208 an answer that stopped normally and parses is not continued', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(whole)]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding', 'Mailer']);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('P5-03 what is and is not a cut answer', () => {
  it('RF-208 a length stop before any JSON started is continued, not repaired', async () => {
    const lead = 'I have read the area and these are the cards I found, starting with the checkout';
    const { fake, request } = ungatedLoopSetup([cutTurn(lead), textTurn(whole)]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding', 'Mailer']);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.messages.at(-1)?.content).toBe(continueAsk);
  });

  it('RF-208 a length stop with a complete card list and a closed fence is not continued', async () => {
    const fenced = `\`\`\`json
${whole}
\`\`\``;
    const { fake, request } = ungatedLoopSetup([cutTurn(fenced)]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding', 'Mailer']);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('P5-03 the continuation and the second cut', () => {
  it('Q-55 the continuation is a metered turn: its tokens are counted and its call id is its own', async () => {
    const { fake, request } = ungatedLoopSetup([
      cutTurn(afterCard, { ...usage, inputTokens: 100, outputTokens: 4_096 }),
      textTurn(whole.slice(afterCard.length), { ...usage, inputTokens: 4_300, outputTokens: 200 }),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(2);
    expect(result.usage.inputTokens).toBe(4_400);
    expect(result.usage.outputTokens).toBe(4_296);
    expect(fake.requests.map((sent) => sent.context.callId)).toEqual(['run-1#1', 'run-1#2']);
  });

  it('RF-208 a second cut is not continued again: the repair path follows and keeps the finished cards', async () => {
    const { fake, request } = ungatedLoopSetup(
      [cutTurn(afterCard), cutTurn(' "x'), cutTurn(afterCard), cutTurn(afterCard)],
      { maxTurns: 12 },
    );

    const result = await runAgentTask(request(fake));

    const asks = fake.requests.slice(1).map((sent) => sent.messages.at(-1)?.content);
    expect(asks.filter((ask) => ask === continueAsk)).toHaveLength(1);
    expect(asks.filter((ask) => ask?.startsWith('Fix these problems'))).toHaveLength(2);
    expect(fake.requests).toHaveLength(4);
    expect(titles(result.drafts)).toEqual(['Checkout', 'Tax rounding']);
  });
});
