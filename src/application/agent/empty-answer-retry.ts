import type { LlmResponse } from '../ports/llm-provider.js';
import type { AnswerNote } from './answer-note.js';

// RF-402, Q-58: a reasoning model can spend its whole output limit on hidden reasoning and answer
// with empty text and `finishReason: length`. Asking such an answer to continue only repeats the
// waste, so the call is made once more with the limit doubled. The doubled limit never passes the
// largest limit a role accepts (the settings range), and the retry is one more call through the
// same guards, so the caps apply to it like to any other call. The limit stays doubled for the rest
// of the task, because the model has shown it needs the room. After a retry that is empty too, or
// at the largest limit, no more retries are made and the answer is handled as before. A later empty
// answer after a good retry is retried again, at the doubled limit, up to the largest.

/** The largest `maxOutputTokens` a role accepts (`project-settings.ts`, DEC-117). */
export const OUTPUT_LIMIT_CEILING = 32_768;

/** An answer with no text and no tool call that stopped because it reached the output limit. */
function isEmptyAtLimit(response: LlmResponse): boolean {
  return (
    response.finishReason === 'length' &&
    response.text.trim() === '' &&
    response.toolCalls.length === 0
  );
}

// RF-402
export class EmptyAnswerRetry {
  private current: number | undefined;
  private spent = false;

  constructor(limit: number | undefined) {
    this.current = limit;
  }

  /** The output limit of the next call, as the field of the request (none when the role has none). */
  get request(): { readonly maxOutputTokens?: number } {
    return this.current === undefined ? {} : { maxOutputTokens: this.current };
  }

  /**
   * Q-58: one model call, and a second one with the limit doubled when the first was empty at the limit
   * (not asked to continue). */
  async ask(
    send: () => Promise<LlmResponse>,
    note: (note: AnswerNote) => Promise<void>,
  ): Promise<LlmResponse> {
    const first = await send();
    if (this.spent || !isEmptyAtLimit(first)) return first;
    const bigger = this.doubled();
    if (bigger === undefined) {
      this.spent = true;
      await note({ outcome: 'empty', reason: 'no-room' });
      return first;
    }
    this.current = bigger;
    await note({ outcome: 'retried', reason: 'empty-at-limit' });
    const second = await send();
    if (isEmptyAtLimit(second)) {
      this.spent = true;
      await note({ outcome: 'empty', reason: 'after-retry' });
    }
    return second;
  }

  private doubled(): number | undefined {
    if (this.current === undefined || this.current >= OUTPUT_LIMIT_CEILING) return undefined;
    return Math.min(this.current * 2, OUTPUT_LIMIT_CEILING);
  }
}
