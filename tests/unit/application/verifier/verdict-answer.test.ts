import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import {
  MAX_REASON_CHARS,
  parseVerdictAnswer,
} from '../../../../src/application/verifier/verdict-answer.js';

// RF-301, DEC-57, ADR-013: the verifier's answer is model output; only a well-formed answer with
// the reason before the verdict counts, and nothing else is ever read as `Supported`.

type Answer = Pick<LlmResponse, 'text' | 'toolCalls' | 'finishReason'>;

function answer(text: string, change: Partial<Answer> = {}): Answer {
  return { text, toolCalls: [], finishReason: 'stop', ...change };
}

const bell = String.fromCharCode(7);

describe('verdict answer', () => {
  it('RF-301 a reason then a verdict gives the status and the one-line reason', () => {
    const supported = answer('Reason: Line 7 sets the label.\nVerdict: Supported');
    const rejected = answer('reason:  No line runs it. \r\n\r\nVERDICT: rejected\n');

    expect(parseVerdictAnswer(supported)).toEqual({
      ok: true,
      value: { status: 'Supported', reason: 'Line 7 sets the label.' },
    });
    expect(parseVerdictAnswer(rejected)).toEqual({
      ok: true,
      value: { status: 'Rejected', reason: 'No line runs it.' },
    });
  });

  it('RF-301 DEC-57 a verdict written before its reason is refused with the order problem', () => {
    const parsed = parseVerdictAnswer(answer('Verdict: Supported\nReason: Line 7 sets the label.'));

    expect(parsed).toEqual({ ok: false, error: 'the reason must come before the verdict.' });
  });

  it('RF-301 DEC-57 a verdict alone is refused with the order problem', () => {
    expect(parseVerdictAnswer(answer('Verdict: Supported'))).toEqual({
      ok: false,
      error: 'the reason must come before the verdict.',
    });
  });
});

describe('verdict answer: invalid answers', () => {
  it.each([
    ['a bare word', 'Supported'],
    ['an empty answer', ''],
    ['a value outside the two', 'Reason: The label is set.\nVerdict: Unverified'],
    ['a hedged value', 'Reason: The label is set.\nVerdict: Supported, mostly'],
    ['a value with a period', 'Reason: The label is set.\nVerdict: Supported.'],
    ['Markdown', '**Reason:** The label is set.\n**Verdict:** Supported'],
    ['a third line', 'Reason: The label is set.\nVerdict: Supported\nVerdict: Rejected'],
    ['a reason on two lines', 'Reason: The label\nis set.\nVerdict: Supported'],
    ['an empty reason', 'Reason:\nVerdict: Supported'],
    ['a reason with a control character', `Reason: The label${bell} is set.\nVerdict: Supported`],
    ['JSON', '{"reason": "The label is set.", "verdict": "Supported"}'],
    ['a long s that folds to s', 'Reason: The label is set.\nVerdict: ſupported'],
  ])('RF-301 %s is not a verdict', (_name, text) => {
    const parsed = parseVerdictAnswer(answer(text));

    expect(parsed.ok).toBe(false);
  });

  it('RF-301 a reason longer than the limit is refused', () => {
    const long = `Reason: ${'a'.repeat(MAX_REASON_CHARS + 1)}\nVerdict: Supported`;

    expect(parseVerdictAnswer(answer(long))).toEqual({
      ok: false,
      error: 'the reason must be at most 300 characters.',
    });
  });

  it('RF-301 an answer that called a tool is refused whatever its text says', () => {
    const toolCalls = [{ id: 'call-1', name: 'read_file', arguments: {} }];
    const text = 'Reason: Line 7 sets the label.\nVerdict: Supported';

    expect(parseVerdictAnswer(answer(text, { toolCalls }))).toEqual({
      ok: false,
      error: 'the answer called a tool; there are no tools.',
    });
  });

  it('RF-301 an answer cut at the output limit is refused whatever its text says', () => {
    const text = 'Reason: Line 7 sets the label.\nVerdict: Supported';

    expect(parseVerdictAnswer(answer(text, { finishReason: 'length' }))).toEqual({
      ok: false,
      error: 'the answer was cut off before it ended.',
    });
  });
});
