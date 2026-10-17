import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeRepositoryReader } from '../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { scanRepository } from '../../src/infrastructure/scan/universal/universal-scan.js';
import type {
  ScanOptions,
  UniversalScan,
} from '../../src/infrastructure/scan/universal/scan-types.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';

export type FixtureRepository =
  'webforms-csharp' | 'webforms-ef' | 'webforms-shop' | 'php-shop' | 'cobol-ledger';

const defaultMaxFileBytes = 1_000_000;

export function fixtureRoot(name: FixtureRepository): string {
  return join(process.cwd(), 'tests', 'fixtures', 'repos', name);
}

/** Copies a fixture repository into `target` so a test can add files to it. */
export async function copyFixture(name: FixtureRepository, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await cp(fixtureRoot(name), target, { recursive: true });
}

export interface ScanRun {
  readonly scan: UniversalScan;
  readonly reader: NodeRepositoryReader;
}

/** Opens a reader on `root` (no ignore rules) and runs the universal scan over it. */
export async function scanTree(
  root: string,
  options: { readonly subpath?: string; readonly maxFileBytes?: number } = {},
): Promise<ScanRun> {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const reader = await NodeRepositoryReader.open({
    root,
    ignoreRules: '',
    allowDenied: [],
    logger,
    ...(options.subpath === undefined ? {} : { subpath: options.subpath }),
  });
  const scanOptions: ScanOptions = {
    maxFileBytes: options.maxFileBytes ?? defaultMaxFileBytes,
    masker: new SecretMasker(),
  };
  return { scan: await scanRepository(reader, scanOptions), reader };
}
