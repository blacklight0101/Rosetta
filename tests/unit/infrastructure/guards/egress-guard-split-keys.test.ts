import { describe, expect, it } from 'vitest';
import { freshTag } from '../../../support/data-block-tags.js';
import type { LlmMessage } from '../../../../src/application/ports/llm-provider.js';
import { renderDataBlock } from '../../../../src/domain/egress/data-block.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { egressHarness, requestWith, toolResult } from '../../../support/egress-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { sameFileSpellings } from '../../../support/same-file-spellings.js';
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
    renderDataBlock({ source: 'read_file', excerpts: [], text }, freshTag()),
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

const BACKSLASH = String.fromCharCode(0x5c);

/** A read_file call and its result for the lines of one file. */
function read(id: string, path: string, startLine: number, text: string): LlmMessage[] {
  const endLine = startLine + text.split('\n').length - 1;
  const result = toolResult({ text, excerpts: [{ path, startLine, endLine }] });
  return [
    { role: 'assistant', content: '', toolCalls: [{ id, name: 'read_file', arguments: {} }] },
    { role: 'tool', toolCallId: id, content: result.content },
  ];
}

describe('EgressGuard and the reads that follow an open private key', () => {
  it('RF-141 carries an open key into later reads of the same file only', async () => {
    const split = splitKeyCases.find((item) => item.name === 'a key read in three pieces');
    const [opening = '', middle = ''] = split?.pieces ?? [];
    const readme = ['ProjectOverviewForNewDevelopers', 'Run the tests before a change'].join('\n');
    const { guard, fake } = await egressHarness();

    await guard.complete(
      requestWith([
        ...read('call-1', 'src/Web.config', 1, opening),
        ...read('call-2', 'README.md', 1, readme),
        ...read('call-3', 'src/Web.config', 3, middle),
      ]),
    );

    const sent = JSON.stringify(fake.requests);
    expect(sent).toContain('ProjectOverviewForNewDevelopers');
    expect(sent).toContain('Run the tests before a change');
    for (const value of split?.secrets.slice(0, 3) ?? []) expect(sent).not.toContain(value);
  });

  it.each(sameFileSpellings)(
    'RF-141 carries an open key into a read of the same file named %s',
    async (_name, first, other) => {
      const split = splitKeyCases.find((item) => item.name === 'a key read in three pieces');
      const [opening = '', middle = ''] = split?.pieces ?? [];
      const { guard, fake } = await egressHarness();

      await guard.complete(
        requestWith([...read('call-1', first, 1, opening), ...read('call-2', other, 3, middle)]),
      );

      const sent = JSON.stringify(fake.requests);
      for (const value of split?.secrets.slice(0, 3) ?? []) expect(sent).not.toContain(value);
    },
  );
});

describe('EgressGuard and a read of a path that is not a repository path', () => {
  it.each(['src' + BACKSLASH + 'Web.config', 'src/a' + BACKSLASH + 'Web.config'])(
    'RF-141 refuses a read of %s, whose path is not a repository path',
    async (path) => {
      const split = splitKeyCases.find((item) => item.name === 'a key read in three pieces');
      const [opening = ''] = split?.pieces ?? [];
      const { guard, fake } = await egressHarness();

      const failure = await failureOf(
        guard.complete(requestWith(read('call-1', path, 1, opening))),
      );

      expect(failure).toMatchObject({ code: ERROR_CODES.egressMessageRefused });
      expect(fake.requests).toEqual([]);
    },
  );
});
