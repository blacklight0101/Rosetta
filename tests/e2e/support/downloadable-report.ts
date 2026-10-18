import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportFileName } from '../../../src/application/use-cases/export-zip.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { YazlArchiveWriter } from '../../../src/infrastructure/files/yazl-archive-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../../src/infrastructure/report/file-report-writer.js';
import { ReportZipWriter } from '../../../src/infrastructure/report/report-zip-writer.js';
import { fallbackSecurityHeaders } from '../../../src/presentation/web/security-headers.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { filterCards } from '../../support/report-filter-fixtures.js';
import { plainDetail, reportModel } from '../../support/report-fixtures.js';
import { scopeFor } from '../../support/run-event-fixtures.js';

// RF-501, RF-505, RNF-010: a whole report as `BuildReport` leaves it, written by the real report
// writer and the real zip writer into the `report/` folder of a run folder (opened from disk), and
// the same folder served under a sub-path with the headers of the application (the way GitHub
// Pages serves it). The run has a specification, a manifest and, on request, a hand-off package,
// so the zips have something to hold.

const templates = fileURLToPath(new URL('../../../templates/report/', import.meta.url));
export const runKey = '20261012-100000-understand';

const runFiles = {
  'manifest.json': '{"schemaVersion":1}\n',
  'spec.md': '# Specification\n',
  'cards/BR/BR-001.md': '# BR-001\n',
};
const handoffFiles = {
  'handoff/README.md': '# Hand-off package\n',
  'handoff/tasks/T-001.md': '# First task\n',
};

export interface DownloadableReport {
  /** The `report/` folder of the run. */
  readonly folder: string;
  readonly remove: () => Promise<void>;
}

/** Writes the report of the run, with its zips, into a temporary data folder. */
export async function writeDownloadableReport(options: {
  readonly handoff: boolean;
}): Promise<DownloadableReport> {
  const data = await mkdtemp(join(tmpdir(), 'rosetta-e2e-downloads-'));
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir: data, logger });
  const scope = scopeFor(runKey);
  const run = join(data, 'users', scope.userId, 'projects', scope.projectId, 'runs', runKey);
  const files = { ...runFiles, ...(options.handoff ? handoffFiles : {}) };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(run, path)), { recursive: true });
    await writeFile(join(run, path), text);
  }
  const downloads = {
    run: exportFileName(runKey, 'run'),
    ...(options.handoff ? { handoff: exportFileName(runKey, 'handoff') } : {}),
  };
  const model = reportModel({
    ...{ cards: [...filterCards], cardDetails: [plainDetail], downloads },
    areas: [{ name: 'orders', mapLevel: 'symbols' }],
  });
  await new FileReportWriter({ writer, masker, assetsFolder: templates }).write(scope, model);
  await new ReportZipWriter(data, new YazlArchiveWriter(data)).write(scope, downloads);
  return {
    folder: join(run, 'report'),
    remove: () => rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

const types: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

/** Answers with a file of the folder under `prefix`, like a static host, plus the application headers. */
function folderHandler(
  folder: string,
  prefix: string,
): (request: IncomingMessage, response: ServerResponse) => void {
  const headers = fallbackSecurityHeaders('http://127.0.0.1');
  return (request, response) => {
    const url = request.url ?? '';
    const name = url.split('?')[0]?.slice(prefix.length) ?? '';
    const safe = url.startsWith(prefix) && /^[A-Za-z0-9._-]+$/u.test(name);
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    const finish = (body: Buffer | undefined): void => {
      response.statusCode = body === undefined ? 404 : 200;
      response.setHeader('content-type', types[extname(name)] ?? 'application/octet-stream');
      response.end(body ?? 'not found');
    };
    if (!safe) {
      finish(undefined);
      return;
    }
    readFile(join(folder, name)).then(finish, () => {
      finish(undefined);
    });
  };
}

/** The report folder served under `prefix` (for example `/pages/rosetta/`). */
export async function serveReportFolder(
  folder: string,
  prefix: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(folderHandler(folder, prefix));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('The server has no port.');
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
