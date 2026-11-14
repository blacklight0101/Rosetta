import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { readerPartTargets } from '../../../../src/application/lab/targets/reader-part-targets.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { draftFile, environment } from '../../../support/lab-target-env.js';

// RF-1410: the last reader turn is read as a run reads it: an empty cards list with no problem is a
// final answer a run accepts (agent-loop.ts `finish`), not a failure of the prompt.

const promptsFolder = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

const input = {
  area: 'shop',
  files: [{ path: 'shop/launchSettings.json', language: 'json', lines: 3 }],
  workbook: true,
  turns: 2,
  reads: [{ path: 'shop/launchSettings.json', startLine: 1, lines: ['{', '}'] }],
};

let targets: Map<string, LabTarget>;

beforeAll(async () => {
  const prompts = await loadReaderPrompts(promptsFolder);
  targets = new Map(readerPartTargets(prompts).map((each) => [each.id, each]));
});

async function run(id: string, text: string, draft: string) {
  const parsed = targets.get(id)?.parseInput(input);
  if (parsed?.ok !== true) throw new Error(`not parsed: ${id}`);
  const { env } = environment([{ text }]);
  return parsed.value.run(env, draftFile('x.v9.md', draft));
}

describe('an empty cards answer on the last turn', () => {
  it('RF-1410 reads an empty cards list with no problem as NoCards and usable, as a run accepts it', async () => {
    const empty = ['```json', '{"cards": []}', '```'].join('\n');

    expect(await run('reader/turns-left', empty, '{{turns}}')).toEqual({
      usable: true,
      detail: 'NoCards',
    });
    expect(await run('reader/workbook', '{"cards": []}', 'Guidance.')).toEqual({
      usable: true,
      detail: 'NoCards',
    });
  });

  it('RF-1410 keeps an answer with no card and a problem unusable', async () => {
    expect(await run('reader/turns-left', '{"cards": [', '{{turns}}')).toEqual({
      usable: false,
      detail: 'Unusable',
    });
    expect(await run('reader/turns-left', 'Sorry.', '{{turns}}')).toEqual({
      usable: false,
      detail: 'Unusable',
    });
  });
});
