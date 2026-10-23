import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { cardObject } from '../../../support/card-output.js';
import { ungatedLoopSetup, textTurn } from '../../../support/agent-loop-harness.js';

// RF-208, RF-202: the follow-ups an agent's final answer earns. Valid cards are kept whatever else
// is wrong; problems earn up to two targeted repairs (the second with only what remains); an answer
// cut off earns a continuation instead of a new start; and every follow-up is a turn like any
// other, so the turn limit holds.

const good = { text: 'It creates an order.', citations: ['src/Orders/Checkout.cs:10-24'] };
const bad = { text: 'It sends a mail.', citations: ['src/Orders/Mailer.cs line 4'] };

function answer(...cards: Record<string, unknown>[]): string {
  return JSON.stringify({ cards });
}

const cardA = cardObject({ title: 'Checkout', claims: [good] });
const cardB = cardObject({ title: 'Mailer', claims: [bad] });
const cardBFixed = cardObject({
  title: 'Mailer',
  claims: [{ text: 'It sends a mail.', citations: ['src/Orders/Mailer.cs:3-9'] }],
});
const cardC = cardObject({ title: 'Audit', claims: [bad] });
const cardCFixed = cardObject({
  title: 'Audit',
  claims: [{ text: 'It audits.', citations: ['src/Orders/Audit.cs:1-5'] }],
});

describe('runAgentTask keeps valid cards and repairs the rest', () => {
  it('RF-208 an answer with one invalid card keeps the valid card and asks one repair about the invalid one only', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(answer(cardA, cardB)),
      textTurn(answer(cardBFixed)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Mailer']);
    expect(result.problems).toEqual([]);
    expect(result.rawOutputs).toEqual([]);
    expect(fake.requests).toHaveLength(2);
    const repair = fake.requests[1]?.messages.at(-1)?.content ?? '';
    expect(repair).toContain('cards.1.claims.0.citations.0');
    expect(repair.match(/^- /gmu)).toHaveLength(1);
  });
});

describe('runAgentTask merges what the repairs give', () => {
  it('RF-208 a card the repair sends again replaces the earlier one instead of doubling it', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(answer(cardA, cardB)),
      textTurn(answer(cardA, cardBFixed)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Mailer']);
  });

  it('RF-208 the second repair names only the problems that remain', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(answer(cardA, cardB, cardC)),
      textTurn(answer(cardBFixed, cardC)),
      textTurn(answer(cardCFixed)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Mailer', 'Audit']);
    expect(fake.requests).toHaveLength(3);
    const first = fake.requests[1]?.messages.at(-1)?.content ?? '';
    const second = fake.requests[2]?.messages.at(-1)?.content ?? '';
    expect(first.match(/^- /gmu)).toHaveLength(2);
    expect(second.match(/^- /gmu)).toHaveLength(1);
    expect(second).toContain('cards.1.claims.0.citations.0');
  });
});

describe('runAgentTask ends when the repairs are used up', () => {
  it('RF-208 an answer that is still invalid after two repairs gets no third one; the valid cards are kept', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(answer(cardA, cardB)),
      textTurn(answer(cardB)),
      textTurn(answer(cardB)),
      textTurn(answer(cardBFixed)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(3);
    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.rawOutputs).toHaveLength(3);
  });

  it('RF-208 a card whose every claim is invalid gives no draft and, when nothing else is valid, InvalidOutput', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(answer(cardB)),
      textTurn(answer(cardB)),
      textTurn(answer(cardB)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('InvalidOutput');
    expect(result.code).toBe(ERROR_CODES.cardOutputInvalid);
    expect(result.drafts).toEqual([]);
    expect(result.problems.map((problem) => problem.path)).toContain(
      'cards.0.claims.0.citations.0',
    );
  });
});

describe('runAgentTask ends InvalidOutput when nothing is valid', () => {
  it('RF-208 an answer that is all prose gets two repairs and then ends InvalidOutput with all three answers', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn('I will keep looking.'),
      textTurn('Still thinking.'),
      textTurn('No cards today.'),
      textTurn(answer(cardA)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('InvalidOutput');
    expect(result.rawOutputs).toEqual([
      'I will keep looking.',
      'Still thinking.',
      'No cards today.',
    ]);
    expect(fake.requests).toHaveLength(3);
  });

  it('RF-208 valid answers need no follow-up and read as before', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(answer(cardA)), textTurn(answer(cardB))]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts).toHaveLength(1);
    expect(result.problems).toEqual([]);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('runAgentTask asks a cut-off answer to continue', () => {
  const whole = answer(cardA);
  const cutAt = whole.indexOf('creates') + 4;

  it('RF-208 an answer cut off by the output limit is asked to continue, not to start again', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(whole.slice(0, cutAt)),
      textTurn(whole.slice(cutAt)),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.messages.at(-1)?.content).toBe('Continue where you stopped.');
  });

  it('RF-208 a continuation that sends the whole answer again instead is still read', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(whole.slice(0, cutAt)), textTurn(whole)]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts).toHaveLength(1);
    expect(fake.requests).toHaveLength(2);
  });

  it('RF-208 an answer cut off twice is continued once and then repaired at most twice: four turns, no loop', async () => {
    const { fake, request } = ungatedLoopSetup(
      Array.from({ length: 8 }, (_, turn) =>
        textTurn(`{"cards": [{"type": "FEAT", "title${String(turn)}"`),
      ),
      { maxTurns: 12 },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('InvalidOutput');
    expect(fake.requests).toHaveLength(4);
    const asks = fake.requests.slice(1).map((sent) => sent.messages.at(-1)?.content);
    expect(asks.filter((ask) => ask === 'Continue where you stopped.')).toHaveLength(1);
    expect(asks.filter((ask) => ask?.startsWith('Fix these problems'))).toHaveLength(2);
  });
});

describe('runAgentTask follow-ups are turns like any other', () => {
  it('RF-208 RF-201 no repair starts at the turn limit; the valid cards of the answer are kept', async () => {
    const { fake, request } = ungatedLoopSetup(
      [textTurn(answer(cardA, cardB)), textTurn(answer(cardBFixed))],
      {
        maxTurns: 1,
      },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.code).toBe(ERROR_CODES.agentTurnLimitReached);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(fake.requests).toHaveLength(1);
  });

  it('RF-208 RF-201 the second repair stops at the turn limit and keeps what the first one gave', async () => {
    const { fake, request } = ungatedLoopSetup(
      [textTurn(answer(cardA, cardB, cardC)), textTurn(answer(cardBFixed, cardC)), textTurn('x')],
      { maxTurns: 2 },
    );

    const result = await runAgentTask(request(fake));

    expect(result.reason).toBe('max-turns');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Mailer']);
    expect(fake.requests).toHaveLength(2);
  });
});
