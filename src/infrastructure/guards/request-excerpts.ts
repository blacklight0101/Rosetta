import type { LlmMessage, LlmRequest } from '../../application/ports/llm-provider.js';
import type { Citation } from '../../domain/cards/citation.js';
import { scanDataBlocks } from '../../domain/egress/data-block-scan.js';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-142, RF-145, ADR-013: where repository content may stand in a request, and the excerpts it
// carries. The system prompt holds no data block; a tool result is exactly one block; a user
// message may hold blocks among its text, each of them whole. The assistant's own text is model
// output and is not read for blocks: it can name no excerpt in the egress log.

const refusals = {
  system: 'A model call was refused because its system prompt holds repository content.',
  tool: 'A model call was refused because a tool result is not exactly one data block.',
  user: 'A model call was refused because a message holds a broken data block.',
} as const;

function messageExcerpts(message: LlmMessage): Result<readonly Citation[], string> {
  if (message.role === 'assistant') return ok([]);
  const scan = scanDataBlocks(message.content);
  if (message.role === 'tool') {
    const single = scan.ok && scan.value.blocks === 1 && !scan.value.textOutside;
    return single ? ok(scan.value.excerpts) : err(refusals.tool);
  }
  return scan.ok ? ok(scan.value.excerpts) : err(refusals.user);
}

/** The excerpts of every data block in message order, or the reason the request is refused. */
// RF-145
export function requestExcerpts(request: LlmRequest): Result<readonly Citation[], string> {
  if (holdsDataMarker(request.system)) return err(refusals.system);
  const excerpts: Citation[] = [];
  for (const message of request.messages) {
    const found = messageExcerpts(message);
    if (!found.ok) return found;
    excerpts.push(...found.value);
  }
  return ok(excerpts);
}
