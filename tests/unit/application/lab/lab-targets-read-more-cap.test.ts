import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { readerPartTargets } from '../../../../src/application/lab/targets/reader-part-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment } from '../../../support/lab-target-env.js';

// RF-1414, RF-1410: with the cap set, the read-more target states the line budget of the ask in the
// refusal and grades the turn with the reads cut at it, as a run serves them. DEC-246: the cap is off
// by default, so the lab cuts nothing, as a run does.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 900 }],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
  readMore: { percent: 1, readTokens: 20, tokens: 9000, unread: ['shop/Orders.cs'] },
};

const long = {
  id: 'c4',
  name: 'read_file',
  arguments: { path: 'shop/Orders.cs', startLine: 12, endLine: 411 },
};

let target: LabTarget | undefined;
let capped: LabTarget | undefined;

beforeAll(async () => {
  const prompts = await loadReaderPrompts(promptsFolder);
  const readMore = (each: LabTarget): boolean => each.id === 'reader/read-more';
  target = readerPartTargets(prompts).find(readMore);
  capped = readerPartTargets(prompts, 350).find(readMore);
});

describe('the read-more line cap in the lab, off by default', () => {
  it('RF-1414 states no budget and cuts nothing when no cap is set (DEC-246)', async () => {
    const parsed = target?.parseInput(input);
    if (parsed?.ok !== true) throw new Error('not parsed');
    const { env, requests } = environment([{ text: '', toolCalls: [long] }]);

    const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'Read more. {{files}}'));

    expect(requests[0]?.messages.at(-1)?.content).toContain('Read more.');
    expect(outcome.turn).toMatchObject({ newLines: 400, cutLines: 0 });
  });
});

describe('the read-more line cap in the lab, when set', () => {
  it('RF-1414 states the budget in the refusal and cuts the turn at it', async () => {
    const parsed = capped?.parseInput(input);
    if (parsed?.ok !== true) throw new Error('not parsed');
    const { env, requests } = environment([{ text: '', toolCalls: [long] }]);

    const outcome = await parsed.value.run(
      env,
      draftFile('x.v9.md', 'At most {{lines}}. {{files}}'),
    );

    expect(requests[0]?.messages.at(-1)?.content).toContain('At most 350.');
    expect(outcome.turn).toMatchObject({ newLines: 350, cutLines: 50 });
  });
});
