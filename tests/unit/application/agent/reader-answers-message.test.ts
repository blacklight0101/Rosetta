import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readerTaskMessage } from '../../../../src/application/agent/reader-prompts.js';
import {
  loadAnswersPrompt,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-241, RNF-004: the answers reach the reader through their own versioned prompt file, after the area.

describe('the first message of a re-run reader', () => {
  it('RF-241 follows the area block with the answers prompt and the answers block', async () => {
    const prompts = {
      ...(await loadReaderPrompts('prompts')),
      answers: await loadAnswersPrompt('prompts'),
    };

    const message = readerTaskMessage(prompts, 'AREA-BLOCK', 'ANSWERS-BLOCK');

    expect(prompts.answers.name).toBe('reader/answers.v2.md');
    expect(message.indexOf('AREA-BLOCK')).toBeGreaterThan(-1);
    expect(message.indexOf('ANSWERS-BLOCK')).toBeGreaterThan(message.indexOf('AREA-BLOCK'));
  });

  it('RF-241 adds nothing without answers', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts).not.toHaveProperty('answers');
    expect(readerTaskMessage(prompts, 'AREA-BLOCK')).not.toContain('answers');
  });

  it('RF-241 refuses an answers prompt that lost its placeholder', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rosetta-answers-prompt-'));
    await mkdir(join(folder, 'reader'));
    await writeFile(join(folder, 'reader', 'answers.v2.md'), 'No placeholder here.\n');

    await expect(loadAnswersPrompt(folder)).rejects.toThrow(/placeholder/u);
  });
});
