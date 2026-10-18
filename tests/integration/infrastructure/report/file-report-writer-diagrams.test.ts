import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../../../src/infrastructure/report/file-report-writer.js';
import { auditHtml } from '../../../support/html-audit.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { reportModel } from '../../../support/report-fixtures.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-508, RF-504: a report of a run that has diagrams gets the diagrams page and the files it loads
// (the vendored Mermaid build, its loader and its licence); a report of a run without any is
// unchanged, so it does not carry five megabytes it never uses.

const templates = fileURLToPath(new URL('../../../../templates/report/', import.meta.url));
const data = useTempRoot('rosetta-report-diagrams-');
const scope: RunScope = scopeFor('20261012-100000-understand');
const masker = new SecretMasker();
const clock = new FixedClock('2026-10-12T10:00:00.000Z');
const diagram = { document: 'spec.md', title: 'Screens', source: 'flowchart LR\n  s1["Home"]' };

function reportFolder(): string {
  const { projectId, runKey, userId } = scope;
  return join(data.path, 'users', userId, 'projects', projectId, 'runs', runKey, 'report');
}

async function write(
  diagrams: readonly (typeof diagram)[] | undefined,
): Promise<readonly string[]> {
  const writer = new NodeOutputWriter({
    dataDir: data.path,
    logger: new MemoryLogger(clock, masker),
  });
  const files = new FileReportWriter({ writer, masker, assetsFolder: templates });
  return files.write(scope, reportModel({ diagrams }));
}

const diagramFiles = ['diagrams.html', 'diagrams.js', 'mermaid.LICENSE.txt', 'mermaid.min.js'];

describe('FileReportWriter and the diagrams', () => {
  it('RF-508 writes the diagrams page, the Mermaid build, its loader and its licence', async () => {
    const written = await write([diagram]);

    for (const name of diagramFiles) expect(written).toContain(`report/${name}`);
    const folder = await readdir(reportFolder());
    for (const name of diagramFiles) expect(folder).toContain(name);
  });

  it('RF-508 writes the build and the loader as the templates hold them, byte for byte', async () => {
    await write([diagram]);

    for (const name of ['mermaid.min.js', 'diagrams.js', 'mermaid.LICENSE.txt']) {
      const written = await readFile(join(reportFolder(), name));
      const template = await readFile(join(templates, name));
      expect(template.length).toBeGreaterThan(0);
      expect(written.equals(template)).toBe(true);
    }
  });

  it('RF-508 writes a diagrams page that holds the source of the diagram as text', async () => {
    await write([diagram]);

    const page = auditHtml(await readFile(join(reportFolder(), 'diagrams.html'), 'utf8'));

    expect(page.document.querySelector('figure pre')?.textContent).toBe(diagram.source);
  });

  it('RF-508 masks a secret in a diagram before the page is written', async () => {
    const secret = fakeOpenAiKey;
    await write([{ ...diagram, source: `flowchart LR\n  s1["${secret}"]` }]);

    expect(await readFile(join(reportFolder(), 'diagrams.html'), 'utf8')).not.toContain(secret);
  });

  it('RF-508 writes none of it for a run without diagrams', async () => {
    for (const diagrams of [undefined, []]) {
      const written = await write(diagrams);

      expect(written.filter((path) => diagramFiles.some((name) => path.endsWith(name)))).toEqual(
        [],
      );
    }
  });
});
