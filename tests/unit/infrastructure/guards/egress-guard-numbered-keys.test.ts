import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { egressHarness, requestWith, toolResult } from '../../../support/egress-harness.js';
import { splitKeyCases, type SplitKeyCase } from '../../../support/split-key-fixture.js';

// RF-141, RF-202 (Q-47): read_file gives each line with its number (`12: text`). A private key
// read in pieces is still masked when its lines carry those numbers.

/** The pieces of a split key as read_file now returns them, one numbered read per piece. */
function numberedReads(split: SplitKeyCase): LlmMessage[] {
  let next = 1;
  return split.pieces.flatMap((piece, index): LlmMessage[] => {
    const lines = piece.split('\n');
    const startLine = next;
    next += lines.length;
    const text = lines.map((line, at) => `${String(startLine + at)}: ${line}`).join('\n');
    const excerpts = [{ path: 'src/Key.cs', startLine, endLine: next - 1 }];
    const id = `call-${String(index)}`;
    return [
      { role: 'assistant', content: '', toolCalls: [{ id, name: 'read_file', arguments: {} }] },
      { role: 'tool', toolCallId: id, content: toolResult({ text, excerpts }).content },
    ];
  });
}

describe('EgressGuard and a private key read in numbered pieces', () => {
  it.each(splitKeyCases)('RF-141 masks $name when each line carries its number', async (split) => {
    const { guard, fake } = await egressHarness();

    await guard.complete(requestWith(numberedReads(split)));

    const sent = JSON.stringify(fake.requests);
    for (const value of split.secrets) expect(sent).not.toContain(value);
  });
});
