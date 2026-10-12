import { setTimeout as sleep } from 'node:timers/promises';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';

// ADR-008, RF-1002: replays a recorded run to many readers at once. The fake provider of ADR-008
// answers call after call, which cannot serve several runs of several users at the same time; this
// one answers by what the call is: the area the first message names and the turn (the assistant
// messages so far). `script` lists, per area, the recorded calls that answer its turns. A call is
// delayed so a page can be seen between the steps, and the area in `hold` waits until the run is
// stopped, which is how a test presses Stop on a run that is still working. Test code only.

export interface ScriptedOptions {
  readonly recording: Recording;
  /** Per area, the indexes of the recorded calls that answer its turns in order. */
  readonly script: Readonly<Record<string, readonly number[]>>;
  /** Milliseconds each call waits before it answers. */
  readonly delayMs: number;
  /** The area whose first call never answers until the run is stopped. */
  readonly hold?: string;
}

const AREA_LINE = /\narea: (.+)\n/u;

function areaOf(request: LlmRequest): string | undefined {
  const first = request.messages[0];
  if (first?.role !== 'user') return undefined;
  return AREA_LINE.exec(first.content)?.[1];
}

export class ScriptedProvider implements LlmProvider {
  private readonly options: ScriptedOptions;

  constructor(options: ScriptedOptions) {
    this.options = options;
  }

  /** True for a call of an area this script knows; the root area is told by its file list. */
  handles(request: LlmRequest): boolean {
    const area = areaOf(request);
    if (area === undefined || this.options.script[area] === undefined) return false;
    const first = request.messages[0];
    return (
      area !== '(root)' || (first?.role === 'user' && first.content.includes('Default.aspx.cs'))
    );
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const area = areaOf(request);
    const turn = request.messages.filter((message) => message.role === 'assistant').length;
    const index = area === undefined ? undefined : this.options.script[area]?.[turn];
    const attempt =
      index === undefined ? undefined : this.options.recording.calls[index]?.attempts[0];
    if (attempt === undefined || !('response' in attempt)) {
      throw new RosettaError(ERROR_CODES.recordingExhausted);
    }
    await this.wait(area, turn, request.signal);
    return attempt.response;
  }

  private async wait(area: string | undefined, turn: number, signal: AbortSignal): Promise<void> {
    const held = area === this.options.hold && turn === 0;
    const delay = held ? 120_000 : this.options.delayMs;
    try {
      await sleep(delay, undefined, { signal });
    } catch (error) {
      throw new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: error });
    }
  }
}
