import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../../../src/infrastructure/scan/scan-pipeline.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { templateSettings } from '../../../support/project-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// P3-109, EV-24: a workbook source gives one area per sheet, one for the macros and one for the
// workbook overview, whatever its size; a sheet that holds no cell gets no area of its own.

const temp = useTempRoot('rosetta-wb-areas-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '00000000-0000-4000-a000-000000000001';
const runKey = '20260101-000001-scan';

const values = (cells: number): string =>
  `# Values of sheet "S"\n- State: visible\n- Used range: A1\n- Non-empty cells: ${String(cells)}\n`;

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content, 'utf8');
}

async function scanAreas(files: Record<string, string>): Promise<string[]> {
  const root = join(temp.path, 'snapshot');
  for (const [path, content] of Object.entries(files)) await put(root, path, content);
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  const pipeline = new SnapshotScanPipeline({
    writer: new NodeOutputWriter({ dataDir: temp.path, logger }),
    masker: new SecretMasker(),
    logger,
    packs: new LanguagePackRegistry([]),
  });
  await pipeline.scan({
    scope: { id: 'run-1', userId, projectId, runKey },
    root,
    source: {
      kind: 'workbook',
      workbooks: ['Book.xlsx'],
      snapshotHash: 'sha256:' + 'a'.repeat(64),
      subpath: '',
    },
    settings: templateSettings.scan,
    signal: new AbortController().signal,
  });
  const out = join(temp.path, 'users', userId, 'projects', projectId, 'runs', runKey);
  const map = JSON.parse(await readFile(join(out, 'codemap.json'), 'utf8')) as {
    areas: { name: string }[];
  };
  return map.areas.map((area) => area.name);
}

describe('areas of a workbook source', () => {
  it('P3-109 gives each sheet and the macros an area although the workbook is far under the budget', async () => {
    const names = await scanAreas({
      'dependencies.md': '# Dependencies\n',
      'Book.xlsx/workbook.md': '# Book\n',
      'Book.xlsx/Inventory/values.md': values(40),
      'Book.xlsx/Inventory/formulas.md': '# F\n',
      'Book.xlsx/Report/values.md': values(12),
      'Book.xlsx/macros/Module1.bas.md': '# Module1\n',
    });

    expect(names).toEqual([
      '(root)',
      'Book.xlsx',
      'Book.xlsx/Inventory',
      'Book.xlsx/Report',
      'Book.xlsx/macros',
    ]);
  });

  it('P3-109 gives a sheet that holds no cell no area: its files join the workbook overview', async () => {
    const names = await scanAreas({
      'Book.xlsx/workbook.md': '# Book\n',
      'Book.xlsx/Empty/values.md': values(0),
      'Book.xlsx/Empty/notes.md': '# N\n',
      'Book.xlsx/Data/values.md': values(3),
    });

    expect(names).toEqual(['Book.xlsx', 'Book.xlsx/Data']);
  });
});
