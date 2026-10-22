import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { EstimateRun } from '../../../../src/application/estimate/estimate-run.js';
import { parseCodeMap } from '../../../../src/infrastructure/scan/codemap/codemap-json.js';
import { estimateView } from '../../../../src/presentation/web/estimate-view.js';
import { scanToOutputs } from '../../../support/code-map-harness.js';
import {
  createEstimateHarness,
  estimatePrices,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { fixtureRoot } from '../../../support/scan-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

const temp = useTempRoot('rosetta-scanner-version-');
const dataDir = (): string => join(temp.path, 'data');

async function scannedText(folder: string): Promise<string> {
  const run = await scanToOutputs(fixtureRoot('webforms-csharp'), {
    runFolder: folder,
    dataDir: dataDir(),
  });
  return readFile(run.codeMapPath, 'utf8');
}

it('RF-113 scan output records a scanner version and preserves it when read', async () => {
  const text = await scannedText('runs/version');
  expect(JSON.parse(text)).toMatchObject({ scannerVersion: 1 });
  expect(parseCodeMap(text)).toMatchObject({ ok: true, value: { scannerVersion: 1 } });
});

it.each([undefined, 0, 1, 2])(
  'RF-113 the estimate says whether a code map of scanner version %s is out of date',
  async (scannerVersion) => {
    const text = (await scannedText('runs/freshness')).replace(
      / {2}"scannerVersion": 1,\r?\n/u,
      '',
    );
    const versioned =
      scannerVersion === undefined
        ? text
        : text.replace(
            '"schemaVersion": 1,',
            `"schemaVersion": 1, "scannerVersion": ${String(scannerVersion)},`,
          );
    const parsed = parseCodeMap(versioned);
    if (!parsed.ok) throw new Error('the code map did not parse');
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, settingsFor({}));
    const estimate = new EstimateRun({
      ...harness,
      priceTable: estimatePrices,
      models: NO_LISTED_MODELS,
      reasoningModels: () => false,
      scans: {
        open: async (scan) => ({ ...(await harness.scans.open(scan)), codeMap: parsed.value }),
      },
    });
    const result = await estimate.execute({ actor: userAmy, projectId: project.id });
    expect(result.ok && estimateView(result.value)).toMatchObject({
      codeMap: {
        scannerVersion: scannerVersion ?? null,
        currentScannerVersion: 1,
        outdated: (scannerVersion ?? 0) < 1,
      },
    });
  },
);
