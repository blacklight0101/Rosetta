import type { LlmMessage, LlmRequest, ToolCall } from '../../application/ports/llm-provider.js';
import type { Citation } from '../../domain/cards/citation.js';
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

/** A piece of repository text and the excerpts of the block it stands in. */
interface ContentPart {
  readonly frame: boolean;
  readonly text: string;
  readonly excerpts: readonly Citation[];
}

/**
 * RF-141: a private key left open by one piece of repository text (a paged read) continues in the
 * later pieces of the request that read the same file, across blocks and messages; a read of
 * another file in between neither continues nor closes it (see private-key-pieces.ts). The file
 * of a piece is the path of its block's first excerpt, and the key it leaves open belongs to the
 * last one; text outside blocks and blocks without excerpts share the empty path.
 */
class KeyCarry {
  private readonly open = new Set<string>();

  /** The piece with the key lines of a key an earlier read of its file left open masked first. */
  take(part: ContentPart, masker: CountingMasker): string {
    const first = part.excerpts[0]?.path ?? '';
    let piece = part.text;
    let open = false;
    if (this.open.delete(first)) {
      const continued = maskKeyContinuation(part.text);
      masker.addKeyPieces(continued.count);
      piece = continued.text;
      open = continued.open;
    }
    if (open || leavesKeyOpen(part.text)) this.open.add(part.excerpts.at(-1)?.path ?? '');
    return piece;
  }
}

/** The content masked between the frames of its data blocks; repository text passes the carry. */
function maskContent(content: string, masker: CountingMasker, carry?: KeyCarry): string {
  const scan = scanDataBlocks(content);
  const parts: readonly ContentPart[] = scan.ok
    ? scan.value.parts
    : [{ frame: false, text: content, excerpts: [] }];
  return parts
    .map((part) => {
      const piece = part.frame || carry === undefined ? part.text : carry.take(part, masker);
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
