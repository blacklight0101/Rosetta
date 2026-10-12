import type { LlmMessage, LlmRequest, ToolCall } from '../../application/ports/llm-provider.js';
import { scanDataBlocks } from '../../domain/egress/data-block-scan.js';
import { maskDeep } from './mask-deep.js';
import { leavesKeyOpen, maskKeyContinuation } from './private-key-pieces.js';
import {
  emptyCounts,
  SECRET_KINDS,
  type MaskResult,
  type SecretKind,
  type TextMasker,
} from './secret-masker.js';

// RF-141, DEC-57: the request as it may leave the machine: the system prompt, every message, every
// tool call's id, name and arguments and every tool result masked. Text is masked between the
// frames of its data blocks, so a secret pattern that runs to the end of its input (a private key
// without an end line) never eats a footer; line breaks stay, so citations stay valid. A masker
// failure is thrown (RST-2101): the caller blocks the call. The tool definitions are not masked:
// they come from code and must never carry repository text (the agent loop, P1-31).

type SecretCounts = Readonly<Record<SecretKind, number>>;

export interface MaskedRequest {
  readonly request: LlmRequest;
  /** Every secret masked in this request. */
  readonly counts: SecretCounts;
  /** The secrets in the parts sent for the first time in the agent task. */
  readonly firstSent: SecretCounts;
}

/** A masker that adds up what the masker it wraps replaced. */
class CountingMasker implements TextMasker {
  readonly counts = emptyCounts();
  private readonly inner: TextMasker;

  constructor(inner: TextMasker) {
    this.inner = inner;
  }

  mask(text: string): MaskResult {
    const result = this.inner.mask(text);
    for (const kind of SECRET_KINDS) this.counts[kind] += result.counts[kind];
    return result;
  }

  /** Counts key pieces masked outside the wrapped masker. */
  addKeyPieces(count: number): void {
    this.counts['private-key'] += count;
  }
}

/**
 * RF-141: a private key left open by one piece of repository text (a paged read) continues in the
 * next pieces of the request, across blocks and messages; see private-key-pieces.ts.
 */
class KeyCarry {
  private open = false;

  /** The piece with the body of a key an earlier piece left open masked first. */
  take(text: string, masker: CountingMasker): string {
    let piece = text;
    let open = false;
    if (this.open) {
      const continued = maskKeyContinuation(text);
      masker.addKeyPieces(continued.count);
      piece = continued.text;
      open = continued.open;
    }
    this.open = open || leavesKeyOpen(text);
    return piece;
  }
}

/** The content masked between the frames of its data blocks; repository text passes the carry. */
function maskContent(content: string, masker: CountingMasker, carry?: KeyCarry): string {
  const scan = scanDataBlocks(content);
  const parts = scan.ok ? scan.value.parts : [{ frame: false, text: content }];
  return parts
    .map(({ frame, text }) => {
      const piece = frame || carry === undefined ? text : carry.take(text, masker);
      return masker.mask(piece).text;
    })
    .join('\n');
}

function maskToolCall(call: ToolCall, masker: TextMasker): ToolCall {
  return {
    id: masker.mask(call.id).text,
    name: masker.mask(call.name).text,
    arguments: maskDeep(call.arguments, masker),
  };
}

function maskMessage(message: LlmMessage, masker: CountingMasker, carry: KeyCarry): LlmMessage {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: maskContent(message.content, masker, carry) };
    case 'assistant':
      return {
        role: 'assistant',
        content: maskContent(message.content, masker),
        ...(message.toolCalls === undefined
          ? {}
          : { toolCalls: message.toolCalls.map((call) => maskToolCall(call, masker)) }),
      };
    case 'tool':
      return {
        role: 'tool',
        toolCallId: masker.mask(message.toolCallId).text,
        content: maskContent(message.content, masker, carry),
      };
  }
}

function sum(left: SecretCounts, right: SecretCounts): SecretCounts {
  const total = emptyCounts();
  for (const kind of SECRET_KINDS) total[kind] = left[kind] + right[kind];
  return total;
}

/**
 * Masks the request. `sentBefore` is the number of messages an earlier call of the agent task
 * already sent; their secrets count in `counts` only, and the system prompt counts as first sent
 * only on the task's first call.
 */
// RF-141
export function maskRequest(
  request: LlmRequest,
  masker: TextMasker,
  sentBefore: number,
): MaskedRequest {
  const repeated = new CountingMasker(masker);
  const fresh = new CountingMasker(masker);
  const system = maskContent(request.system, sentBefore === 0 ? fresh : repeated);
  const carry = new KeyCarry();
  const messages = request.messages.map((message, index) =>
    maskMessage(message, index < sentBefore ? repeated : fresh, carry),
  );
  return {
    request: { ...request, system, messages },
    counts: sum(repeated.counts, fresh.counts),
    firstSent: fresh.counts,
  };
}
