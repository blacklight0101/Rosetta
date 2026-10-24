import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import { parseVerdictAnswer } from '../../../../src/application/verifier/verdict-answer.js';

// P5-35, RF-301, ADR-013: the optional third line of a Rejected answer names the reason kind. The
// answer is model output: only the one exact line after a Rejected verdict is read, nothing else.

type Answer = Pick<LlmResponse, 'text' | 'toolCalls' | 'finishReason'>;

const answer = (text: string): Answer => ({ text, toolCalls: [], finishReason: 'stop' });
const said = 'The lines write status 4 but do not say what 4 means.';
const reason = `Reason: ${said}`;

describe('verdict answer: reason kind', () => {
  it('RF-301 reads "Kind: defined elsewhere" after a Rejected verdict as the reason kind', () => {
    const parsed = parseVerdictAnswer(
      answer(`${reason}\nVerdict: Rejected\nKind: defined elsewhere`),
    );

    expect(parsed).toEqual({
      ok: true,
      value: { status: 'Rejected', reason: said, reasonKind: 'definedElsewhere' },
    });
  });

  it('RF-301 reads the kind line without regard to case and spacing', () => {
    const text = `${reason}\r\nverdict: rejected\r\nKIND:   Defined Elsewhere\r\n`;

    expect(parseVerdictAnswer(answer(text))).toMatchObject({
      ok: true,
      value: { reasonKind: 'definedElsewhere' },
    });
  });

  it('RF-301 an answer without the kind line has no reason kind', () => {
    expect(parseVerdictAnswer(answer(`${reason}\nVerdict: Rejected`))).toEqual({
      ok: true,
      value: { status: 'Rejected', reason: said },
    });
  });

  it.each([
    ['after Supported', `${reason}\nVerdict: Supported\nKind: defined elsewhere`],
    ['another kind', `${reason}\nVerdict: Rejected\nKind: wrong`],
    ['a kind with more words', `${reason}\nVerdict: Rejected\nKind: defined elsewhere, maybe`],
    ['a fourth line', `${reason}\nVerdict: Rejected\nKind: defined elsewhere\nVerdict: Supported`],
    ['a kind before the verdict', `${reason}\nKind: defined elsewhere\nVerdict: Rejected`],
    ['a third line that is no kind', `${reason}\nVerdict: Rejected\nVerdict: Supported`],
  ])('RF-301 %s is not an answer', (_name, text) => {
    expect(parseVerdictAnswer(answer(text)).ok).toBe(false);
  });
});
