import { describe, expect, it } from 'vitest';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { renderDataBlock } from '../../../../src/domain/egress/data-block.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { egressHarness, requestWith, toolResult } from '../../../support/egress-harness.js';
import { splitKeyCases, type SplitKeyCase } from '../../../support/split-key-fixture.js';

// RF-141, DEC-57: a private key read in pieces (paged reads, RF-144) never leaves in part: a piece
// that ends a key is masked back from its END line, and a piece that continues a key left open by
// an earlier piece of the request is masked from its start.

/** Each piece as the result of its own read_file call. */
function separateReads(split: SplitKeyCase): LlmMessage[] {
  return split.pieces.flatMap((text, index): LlmMessage[] => {
    const id = `call-${String(index)}`;
    return [
      { role: 'assistant', content: '', toolCalls: [{ id, name: 'read_file', arguments: {} }] },
      { role: 'tool', toolCallId: id, content: toolResult({ text }).content },
    ];
  });
}

/** Every piece as its own block in one user message. */
function blocksInOneMessage(split: SplitKeyCase): LlmMessage[] {
  const blocks = split.pieces.map((text) =>
    renderDataBlock({ source: 'read_file', excerpts: [], text }),
  );
  return [{ role: 'user', content: ['Files of the area:', ...blocks].join('\n') }];
}

describe('EgressGuard and a private key read in pieces', () => {
  it.each(splitKeyCases)('RF-141 masks $name sent as separate reads', async (split) => {
    const { guard, fake } = await egressHarness();

    await guard.complete(requestWith(separateReads(split)));

    const sent = JSON.stringify(fake.requests);
    for (const value of split.secrets) expect(sent).not.toContain(value);
  });

  it.each(splitKeyCases)('RF-141 masks $name sent as blocks of one message', async (split) => {
    const { guard, fake } = await egressHarness();

    await guard.complete(requestWith(blocksInOneMessage(split)));

    const sent = JSON.stringify(fake.requests);
    for (const value of split.secrets) expect(sent).not.toContain(value);
  });

  it.each(splitKeyCases)('RF-141 keeps every line of $name in place', async (split) => {
    const { guard, fake } = await egressHarness();
    const messages = separateReads(split);

    await guard.complete(requestWith(messages));

    const lines = (list: readonly LlmMessage[]): number[] =>
      list.map((message) => message.content.split('\n').length);
    expect(lines(fake.requests[0]?.messages ?? [])).toEqual(lines(messages));
  });
});

describe('SecretMasker and the tail of a private key', () => {
  it('RF-141 masks the key lines above an END line that has no BEGIN line', () => {
    const [tail] = splitKeyCases.find((split) => split.name.startsWith('the tail'))?.pieces ?? [];

    const result = new SecretMasker().mask(tail ?? '');

    expect(result.text).toBe('[MASKED:private-key]\n\n\nnext line');
    expect(result.counts['private-key']).toBe(1);
  });
});
