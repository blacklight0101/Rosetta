import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  calibrationItems,
  handScoredItems,
  parseHandScored,
  type CheckItem,
} from '../../application/lab/judge/judge-check-set.js';
import type { CheckReport } from '../../application/lab/judge/judge-check.js';
import { RUBRIC_FAMILIES, type Rubric } from '../../application/lab/judge/rubric.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { loadCalibrationSet } from '../eval/calibration-set-file.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { loadRubrics } from './rubric-files.js';

// RF-1405: the files of the judge check: the calibration claims of `eval/calibration/` with the
// source files they cite, the hand-scored samples of `eval/judge-check/hand-scored.json`, the
// rubrics, and `lab-out/<id>/judge-check.json` (git-ignored, masked) for the report.

export interface CheckFolders {
  readonly labFolder: string;
  readonly promptsFolder: string;
  readonly evalFolder: string;
  /** The root of the Rosetta repository, which the calibration set's source folder is relative to. */
  readonly repositoryRoot: string;
}

export interface LoadedCheck {
  readonly items: readonly CheckItem[];
  readonly rubrics: ReadonlyMap<string, Rubric>;
}

const CALIBRATION = 'calibration/webforms-shop.json';
const HAND_SCORED = 'judge-check/hand-scored.json';

async function calibrationOf(folders: CheckFolders): Promise<Result<CheckItem[], string>> {
  const loaded = await loadCalibrationSet(folders.evalFolder, CALIBRATION);
  if (!loaded.ok) return loaded;
  const { set } = loaded.value;
  const files: Record<string, string> = {};
  try {
    for (const claim of set.claims) {
      for (const { path } of claim.citations) {
        const file = join(
          folders.repositoryRoot,
          ...set.source.folder.split('/'),
          ...path.split('/'),
        );
        files[path] ??= await readFile(file, 'utf8');
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(`A file the calibration claims cite cannot be read: ${reason}`);
  }
  return ok(calibrationItems(set, files));
}

async function handScoredOf(
  folders: CheckFolders,
  rubrics: ReadonlyMap<string, Rubric>,
): Promise<Result<CheckItem[], string>> {
  let data: unknown;
  try {
    data = JSON.parse(await readFile(join(folders.evalFolder, ...HAND_SCORED.split('/')), 'utf8'));
  } catch {
    return err(`The hand-scored samples ${HAND_SCORED} cannot be read.`);
  }
  const samples = parseHandScored(data);
  if (!samples.ok) return err(`The hand-scored samples are invalid: ${samples.error}`);
  for (const sample of samples.value) {
    const wanted = (rubrics.get(sample.family)?.criteria ?? []).map((each) => each.id).sort();
    const given = Object.keys(sample.scores).sort();
    if (wanted.join() !== given.join()) {
      return err(`The sample ${sample.id} must score exactly: ${wanted.join(', ')}.`);
    }
  }
  return ok(handScoredItems(samples.value));
}

// RF-1405
export async function loadCheckItems(folders: CheckFolders): Promise<Result<LoadedCheck, string>> {
  const rubrics = await loadRubrics(folders.labFolder, RUBRIC_FAMILIES);
  if (!rubrics.ok) return rubrics;
  const calibration = await calibrationOf(folders);
  if (!calibration.ok) return calibration;
  const hand = await handScoredOf(folders, rubrics.value);
  if (!hand.ok) return hand;
  return ok({ items: [...calibration.value, ...hand.value], rubrics: rubrics.value });
}

// RF-1405
export async function writeJudgeCheck(
  options: { outputDir: string; id: string; masker: TextMasker },
  report: CheckReport,
): Promise<string> {
  const folder = join(options.outputDir, options.id);
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(folder);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(join(folder, 'judge-check.json'), options.masker.mask(text).text, { flag: 'wx' });
  return folder;
}
