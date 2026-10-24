import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { SecretRisks, SecretSite } from '../../domain/planning/secret-risks.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { SecretLines } from '../ports/secret-lines.js';
import type { PlanInputs } from './plan-inputs.js';
import { scanOfSourceRun, type PlanShapeDependencies } from './plan-shapes.js';

// P5-34, RF-141, RF-608, ADR-013: the files of a scan that hold a secret written in plain text,
// with the numbers of their lines, found by the masker's own rules through the read-only reader
// of the snapshot (so an ignored or denied file is never read). A file the reader refuses, a
// binary file (a NUL byte) and a file larger than the limit are not read; the reading stops at a
// total. Nothing is written and no model is called; the value is never kept, only its line.

/** The most bytes of one file read for this, and in all. */
export interface SecretReadLimits {
  readonly perFile: number;
  readonly total: number;
}

const defaultSecretReadLimits: SecretReadLimits = {
  perFile: 1024 * 1024,
  total: 128 * 1024 * 1024,
};

const decoder = new TextDecoder('utf-8');

// RF-141, RF-608
export async function maskedSecretSites(
  scan: {
    readonly codeMap: Pick<CodeMap, 'files'>;
    readonly reader: Pick<RepositoryReader, 'readBytes'>;
  },
  secretLines: SecretLines,
  limits: SecretReadLimits = defaultSecretReadLimits,
): Promise<readonly SecretSite[]> {
  const sites: SecretSite[] = [];
  let read = 0;
  for (const entry of scan.codeMap.files) {
    if (read >= limits.total) break;
    if (entry.skipped !== undefined) continue;
    const result = await scan.reader.readBytes({ path: entry.path, maxBytes: limits.perFile });
    if (!result.ok) continue;
    const { bytes } = result.value;
    if (bytes === undefined || bytes.includes(0)) continue;
    read += bytes.length;
    const lines = secretLines.of(decoder.decode(bytes));
    if (lines.length > 0) sites.push({ path: entry.path, lines });
  }
  return sites;
}

export interface PlanSecretDependencies {
  /** P5-34: which lines of a file hold a secret the masker replaces. */
  readonly secretLines: SecretLines;
}

/**
 * The sites for the plan's risks, taken from the newest completed scan of the snapshot the cards
 * were read at. A scan that cannot be read is logged and leaves no site: the package is still
 * written, and the log says the risks of masked secrets were not listed.
 */
// RF-608
export async function planSecretSites(
  deps: PlanShapeDependencies & PlanSecretDependencies,
  inputs: Pick<PlanInputs, 'project' | 'sourceRun'>,
): Promise<Pick<SecretRisks, 'sites' | 'unread'>> {
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return { sites: [] };
  try {
    const sites = await maskedSecretSites(await deps.scans.open(scan), deps.secretLines);
    return { sites };
  } catch (error) {
    const { project, sourceRun } = inputs;
    await deps.logger.log({
      ...{ level: 'warn', logger: 'plan', runId: sourceRun.runKey, userId: project.userId },
      code: error instanceof RosettaError ? error.code : ERROR_CODES.codeMapMissing,
      message: 'The scan could not be read, so the risks list no file with a plain-text secret.',
    });
    return { sites: [], unread: true };
  }
}
