import type { LlmMessage, LlmRequest, ToolCall } from '../../application/ports/llm-provider.js';
import type { Citation } from '../../domain/cards/citation.js';
import type { DataBlockSource } from '../../domain/egress/data-block.js';
import { scanDataBlocks } from '../../domain/egress/data-block-scan.js';
import { continuationTail } from './continuation-pieces.js';
import { fileKey } from './file-key.js';
import { maskDeep } from './mask-deep.js';
import { maskJsonText } from './mask-json-text.js';
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

  /** The text masked without adding to the counts (it was counted when it was first masked). */
  maskQuietly(text: string): string {
    return this.inner.mask(text).text;
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
  readonly source?: DataBlockSource;
  readonly excerpts: readonly Citation[];
}

/** A piece of repository text and what goes in front of it while it is masked (see KeyCarry). */
interface Taken {
  readonly lead: string;
  readonly text: string;
}

/**
 * RF-141: a private key left open by one piece of repository text (a paged read) continues in the
 * later pieces of the request that read the same file, across blocks and messages; a read of
 * another file in between neither continues nor closes it (see private-key-pieces.ts). The same
 * holds for a secret option left waiting for its value by a shell line continuation at the end of
 * a piece (see continuation-pieces.ts, P2-42): the tail of that piece leads the next piece of the
 * file while it is masked. The file of a piece is the path of its block's first excerpt, and what
 * it leaves open belongs to the last one; text outside blocks and blocks without excerpts share
 * the empty path. Paths compare folded (fileKey), so a read of `A.cs` continues a key left open by
 * a read of `a.cs`.
 */
class KeyCarry {
  private readonly open = new Set<string>();
  private readonly tails = new Map<string, string>();

  /** The piece with the key lines of a key an earlier read of its file left open masked first. */
  take(part: ContentPart, masker: CountingMasker): Taken {
    const first = fileKey(part.excerpts[0]?.path ?? '');
    const last = fileKey(part.excerpts.at(-1)?.path ?? '');
    const lead = this.tails.get(first) ?? '';
    this.tails.delete(first);
    let piece = part.text;
    let open = false;
    if (this.open.delete(first)) {
      const continued = maskKeyContinuation(part.text);
      masker.addKeyPieces(continued.count);
      piece = continued.text;
      open = continued.open;
    }
    if (open || leavesKeyOpen(part.text)) this.open.add(last);
    const tail = continuationTail(lead + part.text);
    if (tail !== undefined) this.tails.set(last, tail);
    return { lead, text: piece };
  }
}

/** The text masked, a lead in front of it taking part in the rules but not in the result. */
function maskLed(taken: Taken, masker: CountingMasker): string {
  const { lead, text } = taken;
  const joint = masker.mask(lead + text).text;
  if (joint.startsWith(lead)) return joint.slice(lead.length);
  // The lead itself held a value (or a scheme word with no value after it), which the rules replaced.
  const head = masker.maskQuietly(lead);
  return joint.startsWith(head) ? joint.slice(head.length) : masker.mask(text).text;
}

/** The content masked between the frames of its data blocks; repository text passes the carry. */
function maskContent(content: string, masker: CountingMasker, carry?: KeyCarry): string {
  const scan = scanDataBlocks(content);
  const parts: readonly ContentPart[] = scan.ok
    ? scan.value.parts
    : [{ frame: false, text: content, excerpts: [] }];
  return parts
    .map((part) => {
      if (part.frame || carry === undefined) return masker.mask(part.text).text;
      if (part.source === 'cards') return masker.mask(maskJsonText(part.text, masker)).text;
      return maskLed(carry.take(part, masker), masker);
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
