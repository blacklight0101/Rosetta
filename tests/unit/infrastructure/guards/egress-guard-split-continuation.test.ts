import { describe, expect, it } from 'vitest';
import { freshTag } from '../../../support/data-block-tags.js';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { renderDataBlock } from '../../../../src/domain/egress/data-block.js';
import {
  backslash,
  fakePassword,
  fakeToken,
  lineTerminators,
  passwordOption,
  tokenOption,
} from '../../../support/continuation-breaks.js';
import { egressHarness, requestWith, toolResult } from '../../../support/egress-harness.js';

// RF-141, RNF-003, P2-42: a shell line continuation that a read_file page or a tool result ends on
// carries over to the next piece of the same file, so the value on its first line is masked.

const cases = [
  { name: '--password', head: `run ${passwordOption} ${backslash}`, tail: fakePassword },
  { name: '--token', head: `run ${tokenOption} Bearer ${backslash}`, tail: fakeToken },
] as const;

function reads(pieces: readonly string[]): LlmMessage[] {
  return pieces.flatMap((text, index): LlmMessage[] => {
    const id = `call-${String(index)}`;
    return [
      { role: 'assistant', content: '', toolCalls: [{ id, name: 'read_file', arguments: {} }] },
      { role: 'tool', toolCallId: id, content: toolResult({ text }).content },
    ];
  });
}

async function sentFor(messages: readonly LlmMessage[]): Promise<string> {
  const { guard, fake } = await egressHarness();
  await guard.complete(requestWith(messages));
  return JSON.stringify(fake.requests);
}

describe('EgressGuard and a continuation cut at a page boundary', () => {
  it.each(cases)('RF-141 masks a $name value on the next page', async (shape) => {
    const sent = await sentFor(reads([`${shape.head}\n`, `  ${shape.tail} --verbose\nnext`]));

    expect(sent).not.toContain(shape.tail);
  });

  it.each(lineTerminators)('RF-141 masks the next page after a mark and $name', async (end) => {
    const sent = await sentFor(reads([`${cases[0].head}${end.value}`, `${fakePassword}\n`]));

    expect(sent).not.toContain(fakePassword);
  });

  it.each(cases)('RF-141 masks a $name value in the next block of one message', async (shape) => {
    const blocks = [shape.head, `${shape.tail}\n`].map((text) =>
      renderDataBlock(
        {
          source: 'read_file',
          excerpts: [{ path: 'src/deploy.sh', startLine: 1, endLine: 2 }],
          text,
        },
        freshTag(),
      ),
    );

    const sent = await sentFor([{ role: 'user', content: blocks.join('\n') }]);

    expect(sent).not.toContain(shape.tail);
  });

  it('RF-141 leaves a page of another file alone', async () => {
    const other = toolResult({
      text: `${fakePassword}\n`,
      excerpts: [{ path: 'src/other.txt', startLine: 1, endLine: 1 }],
    });
    const first = reads([`${cases[0].head}\n`])[1];
    const sent = await sentFor([first ?? other, other]);

    expect(sent).toContain(fakePassword);
  });
});
