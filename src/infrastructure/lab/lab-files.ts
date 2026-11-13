import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import { parseLabCaseSet, type LabCaseSet } from '../../application/lab/lab-case-set.js';
import { parseLabConfig, type LabConfig } from '../../application/lab/lab-config.js';
import { parseLabResults, type LabResults } from '../../application/lab/lab-results.js';
import type { LabOutput } from '../../application/lab/run-lab.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { jsonOf, readEvalFile } from '../eval/golden-set-file.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { loadDraftPromptFile, loadPromptFile } from '../prompts/prompt-files.js';

// RF-1400, RF-1401, RF-1402, RNF-015: the files of the prompt lab. `lab/config.json` and
// `lab/cases/<set>.json` are read like the files under `eval/` (a relative path inside the folder,
// links followed, at most 1 MiB); a prompt version is a file of the prompts folder or a draft file;
// results go to `lab-out/<id>/results.json` (git-ignored), masked like every file Rosetta writes.

const setName = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const folderName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const versionName = /^v\d{1,4}$/u;

// RF-1402
export async function loadLabConfig(labFolder: string): Promise<Result<LabConfig, string>> {
  const bytes = await readEvalFile(labFolder, 'config.json');
  if (!bytes.ok) return bytes;
  const data = jsonOf(bytes.value, 'config.json');
  if (!data.ok) return data;
  const config = parseLabConfig(data.value);
  return config.ok ? config : err(`The lab settings config.json are invalid: ${config.error}`);
}

export interface LoadedLabSet {
  readonly set: LabCaseSet;
  readonly sha256: string;
}

// RF-1401
export async function loadLabCaseSet(
  labFolder: string,
  name: string,
): Promise<Result<LoadedLabSet, string>> {
  if (!setName.test(name)) return err(`${name} is not the name of a case set.`);
  const reference = `cases/${name}.json`;
  const bytes = await readEvalFile(labFolder, reference);
  if (!bytes.ok) return bytes;
  const data = jsonOf(bytes.value, reference);
  if (!data.ok) return data;
  const set = parseLabCaseSet(data.value);
  if (!set.ok) return err(`The case set ${reference} is invalid: ${set.error.join('; ')}`);
  return ok({ set: set.value, sha256: createHash('sha256').update(bytes.value).digest('hex') });
}

/** `v5` is `<family>.v5.md` of the prompts folder; anything else is the path of a draft file. */
// RF-1400
export async function loadPromptVersion(
  promptsFolder: string,
  family: string,
  version: string,
): Promise<Result<PromptFile, string>> {
  try {
    if (versionName.test(version)) {
      return ok(await loadPromptFile(promptsFolder, `${family}.${version}.md`));
    }
    return ok(await loadDraftPromptFile(version));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(`The prompt version ${version} of ${family} cannot be read: ${reason}`);
  }
}

// RF-1403
export class FileLabOutput implements LabOutput {
  private readonly outputDir: string;
  private readonly masker: TextMasker;

  constructor(options: { readonly outputDir: string; readonly masker: TextMasker }) {
    this.outputDir = options.outputDir;
    this.masker = options.masker;
  }

  async write(results: LabResults): Promise<string> {
    const parsed = parseLabResults(results);
    if (!folderName.test(results.id) || !parsed.ok) {
      throw new RosettaError(
        ERROR_CODES.unexpected,
        `The lab results ${results.id} are not valid.`,
      );
    }
    const folder = join(this.outputDir, results.id);
    await mkdir(this.outputDir, { recursive: true });
    await mkdir(folder);
    const text = `${JSON.stringify(parsed.value, null, 2)}\n`;
    await writeFile(join(folder, 'results.json'), this.masker.mask(text).text, { flag: 'wx' });
    return folder;
  }
}

// RF-1403
export async function readLabResults(
  outputDir: string,
  id: string,
): Promise<Result<LabResults, string>> {
  if (!folderName.test(id)) return err(`${id} is not a lab run id.`);
  try {
    const text = await readFile(join(outputDir, id, 'results.json'), 'utf8');
    const parsed = parseLabResults(JSON.parse(text));
    return parsed.ok ? parsed : err(`The results of ${id} are invalid: ${parsed.error}`);
  } catch {
    return err(`The run ${id} has no readable results.json under ${outputDir}.`);
  }
}
