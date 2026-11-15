import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { readerPartTargets } from '../../../../src/application/lab/targets/reader-part-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment } from '../../../support/lab-target-env.js';

// RF-1414, RF-1410: the read-more target states the line budget of the ask in the refusal and
// grades the turn with the reads cut at it, as a run serves them.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [{ path: 'shop/Orders.cs', language: 'csharp', lines: 900 }],
  turns: 6,
  reads: [{ path: 'shop/Orders.cs', startLine: 10, lines: ['class Orders {', '}'] }],
  readMore: { percent: 1, readTokens: 20, tokens: 9000, unread: ['shop/Orders.cs'] },
};

let target: LabTarget | undefined;

beforeAll(async () => {
  const prompts = await loadReaderPrompts(promptsFolder);
  target = readerPartTargets(prompts).find((each) => each.id === 'reader/read-more');
});

describe('the read-more line cap in the lab', () => {
  it('RF-1414 states the budget in the refusal and cuts the turn at it', async () => {
    const parsed = target?.parseInput(input);
    if (parsed?.ok !== true) throw new Error('not parsed');
    const long = {
      id: 'c4',
      name: 'read_file',
      arguments: { path: 'shop/Orders.cs', startLine: 12, endLine: 411 },
    };
    const { env, requests } = environment([{ text: '', toolCalls: [long] }]);

    const outcome = await parsed.value.run(
      env,
      draftFile('x.v9.md', 'At most {{lines}}. {{files}}'),
    );

    expect(requests[0]?.messages.at(-1)?.content).toContain('At most 350.');
    expect(outcome.turn).toMatchObject({ newLines: 350, cutLines: 50 });
  });
});
