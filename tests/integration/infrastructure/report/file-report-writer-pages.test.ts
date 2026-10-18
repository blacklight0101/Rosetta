import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ReportCardDetail } from '../../../../src/application/report/card-detail.js';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../../../../src/infrastructure/report/file-report-writer.js';
import {
  areaPageName,
  cardPageName,
} from '../../../../src/infrastructure/report/site/page-names.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { plainDetail, reportModel, shippingCitation } from '../../../support/report-fixtures.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-500, RF-502, RNF-003: the pages of the areas and the cards are written into `report/` beside
// the others, and every line of source on them is masked before it is written.

const templates = fileURLToPath(new URL('../../../../templates/report/', import.meta.url));
const data = useTempRoot('rosetta-report-pages-');
const scope: RunScope = scopeFor('20261012-100000-understand');
const masker = new SecretMasker();
const clock = new FixedClock('2026-10-12T10:00:00.000Z');

function reportFolder(): string {
  const root = join(data.path, 'users', scope.userId, 'projects', scope.projectId);
  return join(root, 'runs', scope.runKey, 'report');
}

function writer(): FileReportWriter {
  const real = new NodeOutputWriter({
    dataDir: data.path,
    logger: new MemoryLogger(clock, masker),
  });
  return new FileReportWriter({ writer: real, masker, assetsFolder: templates });
}

const readPage = (name: string): Promise<string> => readFile(join(reportFolder(), name), 'utf8');

describe('FileReportWriter and the area and card pages', () => {
  it('RF-500 writes the page of each area and each card beside the other pages', async () => {
    const written = await writer().write(scope, reportModel({ cardDetails: [plainDetail] }));

    expect(written).toEqual(
      expect.arrayContaining([
        `report/${areaPageName('orders')}`,
        `report/${cardPageName('BR-001')}`,
      ]),
    );
    expect(await readdir(reportFolder())).toHaveLength(written.length);
  });

  it('RNF-003 masks a secret in a cited line before the page is written', async () => {
    const secret = fakeOpenAiKey;
    const leaking: ReportCardDetail = {
      ...plainDetail,
      claims: [
        {
          claimId: 'BR-001.c1',
          text: 'Reads the key.',
          status: 'Supported',
          citations: [
            {
              ...shippingCitation,
              excerpt: { kind: 'lines', firstLine: 10, lines: [`var key = "${secret}";`] },
            },
          ],
        },
      ],
    };

    await writer().write(scope, reportModel({ cardDetails: [leaking] }));
    const page = await readPage(cardPageName('BR-001'));

    expect(page).not.toContain(secret);
    expect(page).toContain('var key =');
  });

  it('RF-504 gives the same bytes for the same report', async () => {
    const model = reportModel({ cardDetails: [plainDetail] });
    await writer().write(scope, model);
    const first = await readPage(cardPageName('BR-001'));
    await writer().write(scope, model);

    expect(await readPage(cardPageName('BR-001'))).toBe(first);
  });
});
