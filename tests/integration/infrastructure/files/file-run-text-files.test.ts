import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileRunTextFiles } from '../../../../src/infrastructure/files/file-run-text-files.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-504, RF-005: the text files of a run folder, read through the workspace guard.

const data = useTempRoot('rosetta-run-text-');
const scope = scopeFor('20261012-100000-understand');

function filesOver(): FileRunTextFiles {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  return new FileRunTextFiles(new NodeOutputWriter({ dataDir: data.path, logger }));
}

async function seed(path: string, text: string): Promise<void> {
  const file = join(
    data.path,
    ...['users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey, path],
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

describe('FileRunTextFiles', () => {
  it('RF-504 reads a text file of the run folder', async () => {
    await seed('cards/index.json', '{"schemaVersion":1}\n');

    expect(await filesOver().read(scope, 'cards/index.json')).toBe('{"schemaVersion":1}\n');
  });

  it('RF-504 answers undefined for a file the run does not have', async () => {
    expect(await filesOver().read(scope, 'coverage.md')).toBeUndefined();
  });

  it.each(['../manifest.json', '/etc/passwd', 'cards/../../x', '.hidden', 'a\\b'])(
    'RF-005 answers undefined for the path %s',
    async (path) => {
      await seed('manifest.json', '{}');

      expect(await filesOver().read(scope, path)).toBeUndefined();
    },
  );
});
