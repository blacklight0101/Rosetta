import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { Run } from '../../src/domain/runs/run.js';
import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { FileRunTextFiles } from '../../src/infrastructure/files/file-run-text-files.js';
import { NodeRunFileReader } from '../../src/infrastructure/files/node-run-file-reader.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../src/infrastructure/report/file-report-writer.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import {
  replayDemoEvents,
  replayDemoPaths,
  replayDemoRunKey,
  replayDemoText,
} from './replay-fixture.js';
import { sampleRun } from './run-fixtures.js';
import type { TestServer, TestServerOptions } from './web-server.js';

// RF-504, RF-506: the real run output adapters over a temporary data folder, for the route tests
// that build a report and read it back, and the recorded run written into a run folder.

const templates = fileURLToPath(new URL('../../templates/report/', import.meta.url));

/** The options that give a test server the real file reader and the real report writer. */
export function realRunOutputs(
  dataDir: string,
): Pick<TestServerOptions, 'runFileReader' | 'report'> {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir, logger });
  return {
    runFileReader: new NodeRunFileReader(dataDir),
    report: {
      text: new FileRunTextFiles(writer),
      writer: new FileReportWriter({ writer, masker, assetsFolder: templates }),
    },
  };
}

/** The run folder of the scope inside the data folder. */
export function runFolderOf(dataDir: string, scope: RunScope): string {
  const parts = ['users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey];
  return join(dataDir, ...parts);
}

/** Writes the files of the recorded run, and any extra, into the run folder of the scope. */
export async function writeRunFolder(
  dataDir: string,
  scope: RunScope,
  extra: Readonly<Record<string, string>> = {},
): Promise<void> {
  const files: Record<string, string> = { ...extra };
  for (const path of replayDemoPaths) files[path] = await replayDemoText(path);
  for (const [path, text] of Object.entries(files)) {
    const file = join(runFolderOf(dataDir, scope), path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

/**
 * An ended understand run of the user with the key of the recorded run: its row, its events in
 * the test server's event store and, when `dataDir` is given, its files in the data folder.
 */
export async function seedRecordedRun(
  test: TestServer,
  userId: string,
  dataDir?: string,
): Promise<Run> {
  const run = sampleRun({
    userId,
    runKey: replayDemoRunKey,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    startedAt: 1,
    endedAt: 2,
  });
  await test.runs.runs.insert(run);
  for (const event of await replayDemoEvents()) {
    await test.runs.events.publish(scopeOf(run), event);
  }
  if (dataDir !== undefined) await writeRunFolder(dataDir, scopeOf(run));
  return run;
}
