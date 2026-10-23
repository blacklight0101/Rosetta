import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { cardObject } from '../../../support/card-output.js';
import { textTurn, ungatedLoopSetup, usage } from '../../../support/agent-loop-harness.js';

// P5-14, RF-208, EV-20: a reader answer in code fences, or with a null where an optional object
// goes, is read without a model retry. Synthetic shapes of the Haiku 5.5 battery (HB-09). Only the
// fake provider; no real call.

const fence = '`'.repeat(3);
const checkout = cardObject({ title: 'Checkout' });
const mailer = cardObject({
  title: 'Mailer',
  claims: [{ text: 'It sends a mail after the order.', citations: ['src/Orders/Mailer.cs:3-9'] }],
});
const whole = JSON.stringify({ cards: [checkout, mailer] });
const cutAt = whole.indexOf(',{') + 1;
const first = whole.slice(0, cutAt);
const rest = whole.slice(cutAt);

const cutTurn = (text: string): ScenarioOutcome => ({
  response: { text, toolCalls: [], usage, finishReason: 'length' },
  retried: [],
});

const titles = (drafts: readonly { title: string }[]): string[] =>
  drafts.map((draft) => draft.title);

describe('P5-14 a continuation in a code fence', () => {
  it.each([
    ['opened and closed', `${fence}json\n${rest}\n${fence}`],
    ['only closed', `${rest}\n${fence}`],
    ['only opened', `${fence}json\n${rest}`],
    ['with CRLF line ends', `${fence}json\r\n${rest}\r\n${fence}`],
    ['in tildes', `~~~json\n${rest}\n~~~`],
  ])('RF-208 %s: the fence is not joined into the JSON', async (_name, fragment) => {
    const { fake, request } = ungatedLoopSetup([
      cutTurn(`${fence}json\n${first}`),
      textTurn(fragment),
    ]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout', 'Mailer']);
    expect(result.problems).toEqual([]);
    expect(fake.requests).toHaveLength(2);
  });

  it('RF-208 a fence inside a card text of the fragment is kept', async () => {
    const note = cardObject({ title: 'Docs', summary: `Uses ${fence}sql${fence} blocks.` });
    const full = JSON.stringify({ cards: [checkout, note] });
    const at = full.indexOf(',{') + 1;
    const { fake, request } = ungatedLoopSetup([
      cutTurn(full.slice(0, at)),
      textTurn(`${fence}json\n${full.slice(at)}\n${fence}`),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.drafts[1]?.summary).toBe(`Uses ${fence}sql${fence} blocks.`);
  });
});

describe('P5-14 a missing optional object needs no retry', () => {
  it('RF-208 a fenced answer with nulls for the details the types do not need parses at once', async () => {
    const withNulls = cardObject({ title: 'Checkout', flow: null, screen: null, question: null });
    const answer = `${fence}json\n${JSON.stringify({ cards: [withNulls] })}\n${fence}`;
    const { fake, request } = ungatedLoopSetup([textTurn(answer)]);

    const result = await runAgentTask(request(fake));

    expect(titles(result.drafts)).toEqual(['Checkout']);
    expect(result.problems).toEqual([]);
    expect(fake.requests).toHaveLength(1);
  });
});
