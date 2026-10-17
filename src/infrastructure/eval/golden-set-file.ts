import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep, isAbsolute } from 'node:path';
import {
  parseEvaluationConfig,
  type EvaluationConfig,
} from '../../application/eval/evaluation-config.js';
import { parseGoldenSet } from '../../application/eval/golden-set-schema.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { GoldenSet } from '../../domain/eval/golden-set.js';
import { isRepositoryPath } from '../../domain/sources/permalink.js';

// RNF-006, RNF-015: the golden set and the evaluation settings are JSON files under the `eval/`
// folder of the Rosetta repository. A reference is a relative path with forward slashes that ends
// in `.json`; it is resolved inside the folder (after links are followed), so `..`, an absolute
// path or a link out of the folder is refused. A file above 1 MiB is refused before it is read.
// The golden set's SHA-256 is taken over its bytes, so the results name the exact file they used.

const MAX_EVAL_FILE_BYTES = 1024 * 1024;

export interface LoadedGoldenSet {
  readonly set: GoldenSet;
  readonly sha256: string;
}

function inside(folder: string, file: string): boolean {
  const path = relative(folder, file);
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path);
}

async function readEvalFile(folder: string, reference: string): Promise<Result<Buffer, string>> {
  // P2-11 red step: removed by the feat commit.
  if (reference !== '') return err('red step');
  if (!isRepositoryPath(reference) || !reference.endsWith('.json')) {
    return err(`The evaluation file ${reference} is not a relative .json path inside eval/.`);
  }
  try {
    const root = await realpath(folder);
    const file = await realpath(join(root, ...reference.split('/')));
    if (!inside(root, file)) return err(`The evaluation file ${reference} is outside ${folder}.`);
    const { size } = await stat(file);
    if (size > MAX_EVAL_FILE_BYTES) {
      return err(
        `The evaluation file ${reference} is larger than ${String(MAX_EVAL_FILE_BYTES)} bytes.`,
      );
    }
    return ok(await readFile(file));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(`The evaluation file ${reference} cannot be read: ${reason}`);
  }
}

function jsonOf(bytes: Buffer, reference: string): Result<unknown, string> {
  try {
    const data: unknown = JSON.parse(bytes.toString('utf8'));
    return ok(data);
  } catch {
    return err(`The evaluation file ${reference} is not JSON.`);
  }
}

// RNF-006, RNF-015
export async function loadGoldenSet(
  folder: string,
  reference: string,
): Promise<Result<LoadedGoldenSet, string>> {
  const bytes = await readEvalFile(folder, reference);
  if (!bytes.ok) return bytes;
  const data = jsonOf(bytes.value, reference);
  if (!data.ok) return data;
  const set = parseGoldenSet(data.value);
  if (!set.ok) return err(`The golden set ${reference} is invalid: ${set.error.join('; ')}`);
  const sha256 = createHash('sha256').update(bytes.value).digest('hex');
  return ok({ set: set.value, sha256 });
}

// RNF-015
export async function loadEvaluationConfig(
  folder: string,
  reference: string,
): Promise<Result<EvaluationConfig, string>> {
  const bytes = await readEvalFile(folder, reference);
  if (!bytes.ok) return bytes;
  const data = jsonOf(bytes.value, reference);
  if (!data.ok) return data;
  const config = parseEvaluationConfig(data.value);
  return config.ok
    ? config
    : err(`The evaluation settings ${reference} are invalid: ${config.error}`);
}
