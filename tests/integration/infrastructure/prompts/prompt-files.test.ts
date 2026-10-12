import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { promptVersionsOf } from '../../../../src/application/agent/reader-prompts.js';
import { recordPromptVersions } from '../../../../src/domain/runs/run-manifest.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleManifest } from '../../../support/run-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RNF-004: prompts are versioned files; a run records the version and SHA-256 of each one it used.

const readerPromptNames = [
  'cards/card-format.v1.md',
  'cards/repair.v1.md',
  'reader/area.v1.md',
  'reader/task.v1.md',
  'reader/turns-left.v1.md',
];

async function sha256Of(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

describe('loadReaderPrompts', () => {
  const temp = useTempRoot('rosetta-prompts-');

  it('RNF-004 loads each reader prompt with its version and the SHA-256 of its bytes', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.system).toMatchObject({ name: 'reader/area.v1.md', version: 'v1' });
    expect(prompts.system.sha256).toBe(await sha256Of('prompts/reader/area.v1.md'));
    expect(prompts.task.text).toBe(await readFile('prompts/reader/task.v1.md', 'utf8'));
  });

  it('RNF-004 the manifest records the version and hash of every prompt the reader used', async () => {
    const prompts = await loadReaderPrompts('prompts');
    const store = new MemoryRunManifestStore();
    const scope = scopeFor('20261012-090000-understand');

    await store.write(scope, recordPromptVersions(sampleManifest(), promptVersionsOf(prompts)));
    const stored = await store.read(scope);

    expect(Object.keys(stored?.promptVersions ?? {})).toEqual(readerPromptNames);
    for (const name of readerPromptNames) {
      expect(stored?.promptVersions[name]).toEqual({
        version: 'v1',
        sha256: await sha256Of(join('prompts', name)),
      });
    }
  });

  it('RNF-004 refuses a prompt file that lost its placeholder', async () => {
    for (const name of readerPromptNames) {
      await mkdir(join(temp.path, name.split('/')[0] ?? ''), { recursive: true });
      await writeFile(join(temp.path, name), await readFile(join('prompts', name)));
    }
    await writeFile(join(temp.path, 'reader', 'task.v1.md'), 'Describe the area.');

    const failure = await failureOf(loadReaderPrompts(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });
});
