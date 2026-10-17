import type { Logger } from '../../src/application/ports/logger.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { NodeRepositoryReader } from '../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { buildCodeMap } from '../../src/infrastructure/scan/codemap/build-code-map.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../src/infrastructure/scan/packs/pack-scan.js';
import { scanRepository } from '../../src/infrastructure/scan/universal/universal-scan.js';
import type { DemoArea } from './reader-spike.js';

// P1-47: the demo area of the spike, scanned from a folder on this machine the way a run scans its
// snapshot (universal scan, language packs, code map), with the scan limits of the settings.

export async function loadDemoArea(
  folder: string,
  areaName: string,
  settings: ProjectSettings,
  logger: Logger,
): Promise<DemoArea | string> {
  const masker = new SecretMasker();
  const maxFileBytes = settings.scan.maxFileBytes;
  const reader = await NodeRepositoryReader.open({
    root: folder,
    ignoreRules: '',
    allowDenied: [],
    logger,
  });
  const scan = await scanRepository(reader, { maxFileBytes, masker });
  const packs = await analyseWithPacks({
    files: scan.files,
    reader,
    registry: new LanguagePackRegistry([await CSharpPack.create()]),
    logger,
    maxFileBytes,
  });
  const built = buildCodeMap({
    source: { owner: 'local', repo: 'demo', commitSha: '0'.repeat(40), subpath: '' },
    scan,
    packs,
    areaTokenBudget: settings.scan.areaTokenBudget,
    configuredAreas: [],
    masker,
  });
  if (!built.ok) return `The code map of ${folder} failed: ${built.error}`;
  const area = built.value.areas.find((candidate) => candidate.name === areaName);
  if (area === undefined) {
    const names = built.value.areas.map((candidate) => candidate.name).join(', ');
    return `${folder} has no area "${areaName}". Areas: ${names}.`;
  }
  return { reader, codeMap: built.value, area };
}
