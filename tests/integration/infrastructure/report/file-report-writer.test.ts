import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../../../src/infrastructure/report/file-report-writer.js';
import { areaPageName } from '../../../../src/infrastructure/report/site/page-names.js';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { loadReportAssets } from '../../../../src/infrastructure/report/report-assets.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { auditHtml } from '../../../support/html-audit.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { RefusingWriter } from '../../../support/refusing-writer.js';
import { reportModel, plainCard } from '../../../support/report-fixtures.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-504, RF-506, RF-1013, DEC-112: the report files of a run are written into its `report/`
// folder, masked, with the stylesheet and the script the pages load.

const templates = fileURLToPath(new URL('../../../../templates/report/', import.meta.url));
const data = useTempRoot('rosetta-report-');
const scope: RunScope = scopeFor('20261012-100000-understand');
const masker = new SecretMasker();
const clock = new FixedClock('2026-10-12T10:00:00.000Z');

function runFolder(): string {
  return join(data.path, 'users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey);
}

function writerOver(inner?: (real: NodeOutputWriter) => NodeOutputWriter | RefusingWriter) {
  const real = new NodeOutputWriter({
    dataDir: data.path,
    logger: new MemoryLogger(clock, masker),
  });
  return new FileReportWriter({
    writer: inner === undefined ? real : inner(real),
    masker,
    assetsFolder: templates,
  });
}

const paths = [
  'report/cost.html',
  'report/filters.js',
  'report/questions.html',
  'report/replay.html',
  'report/replay.js',
  'report/report.css',
  'report/report.html',
  'report/report.md',
];

// RF-500: the model of the fixtures has two areas (the card's and the coverage's), so two area pages.
const areaPages = ['catalog', 'orders'].map((area) => `report/${areaPageName(area)}`);

describe('FileReportWriter', () => {
  it('RF-504 writes the Markdown report, the static pages and their assets into report/', async () => {
    const written = await writerOver().write(scope, reportModel());

    expect(written).toEqual([...paths, ...areaPages]);
    expect((await readdir(join(runFolder(), 'report'))).sort()).toEqual(
      [...paths, ...areaPages].map((path) => path.replace('report/', '')).sort(),
    );
  });

  it('RF-504 writes report.md as the Markdown writer renders it', async () => {
    await writerOver().write(scope, reportModel());

    expect(await readFile(join(runFolder(), 'report', 'report.md'), 'utf8')).toBe(
      renderReportMarkdown(reportModel(), masker),
    );
  });

  it('RF-506 ships the stylesheet and the replay script of the templates folder', async () => {
    await writerOver().write(scope, reportModel());

    for (const name of ['report.css', 'replay.js', 'filters.js']) {
      expect(await readFile(join(runFolder(), 'report', name), 'utf8')).toBe(
        await readFile(join(templates, name), 'utf8'),
      );
    }
  });

  it('RF-504 gives the same bytes for the same report, with LF line ends', async () => {
    const writer = writerOver();
    await writer.write(scope, reportModel());
    const first = await Promise.all(paths.map((path) => readFile(join(runFolder(), path), 'utf8')));
    await writer.write(scope, reportModel());
    const second = await Promise.all(
      paths.map((path) => readFile(join(runFolder(), path), 'utf8')),
    );

    expect(second).toEqual(first);
    expect(first.some((text) => text.includes('\r'))).toBe(false);
  });

  it('RF-504 writes nothing outside report/', async () => {
    await writerOver().write(scope, reportModel());

    expect(await readdir(runFolder())).toEqual(['report']);
  });
});

describe('FileReportWriter and the pages', () => {
  it('RF-500 writes the dashboard, the open questions and the cost report with the policy of RF-1013', async () => {
    await writerOver().write(scope, reportModel());
    const names = ['report.html', 'questions.html', 'cost.html', 'replay.html'];

    const pages = await Promise.all(
      names.map(async (name) =>
        auditHtml(await readFile(join(runFolder(), 'report', name), 'utf8')),
      ),
    );

    expect(pages.map((page) => page.csp)).toEqual(names.map(() => REPORT_CSP));
    expect(pages.map((page) => page.referrer)).toEqual(names.map(() => 'no-referrer'));
    expect(pages.flatMap((page) => page.handlers)).toEqual([]);
  });
});

describe('FileReportWriter and failures', () => {
  it('RNF-003 masks a secret in model text in every file', async () => {
    const model = reportModel({ cards: [{ ...plainCard, title: `Key ${fakeOpenAiKey} here` }] });

    await writerOver().write(scope, model);

    for (const path of paths) {
      expect(await readFile(join(runFolder(), path), 'utf8')).not.toContain(fakeOpenAiKey);
    }
  });

  it('RF-504 rejects with RST-1701 when a file is refused', async () => {
    const writer = writerOver((real) => new RefusingWriter(real, 2));

    const failure = await writer.write(scope, reportModel()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RosettaError);
    expect(failure).toMatchObject({ code: ERROR_CODES.reportWriteFailed });
  });
});

describe('loadReportAssets', () => {
  it('RF-506 reads the shipped stylesheet and script', async () => {
    const assets = await loadReportAssets(templates);

    expect(assets['report.css']).toContain('prefers-color-scheme: dark');
    expect(assets['replay.js']).toContain('data-replay-steps');
    expect(assets['filters.js']).toContain('data-card-filters');
  });

  it('RF-506 rejects with RST-1000 when the templates folder lacks them', async () => {
    const failure = await loadReportAssets(join(data.path, 'missing')).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });
});
