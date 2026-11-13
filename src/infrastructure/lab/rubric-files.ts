import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import { parseRubric, type Rubric } from '../../application/lab/judge/rubric.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { loadPromptFile } from '../prompts/prompt-files.js';

// RF-1407: the rubrics of `lab/rubrics/<family>.md` and the judge prompt `prompts/lab/judge.v1.md`.
// A rubric is read as bytes and hashed, like a prompt file, so the results name the exact rubric.

const familyName = /^[a-z]{3,20}$/u;

/** The judge's own prompt, a versioned file like every prompt (RNF-004). */
const JUDGE_PROMPT = 'lab/judge.v1.md';

// RF-1407
async function loadRubric(labFolder: string, family: string): Promise<Result<Rubric, string>> {
  if (!familyName.test(family)) return err(`${family} is not the name of a prompt family.`);
  try {
    const bytes = await readFile(join(labFolder, 'rubrics', `${family}.md`));
    const parsed = parseRubric(
      family,
      bytes.toString('utf8'),
      createHash('sha256').update(bytes).digest('hex'),
    );
    return parsed.ok ? parsed : err(parsed.error);
  } catch {
    return err(
      `The prompt family ${family} has no rubric: lab/rubrics/${family}.md cannot be read.`,
    );
  }
}

// RF-1407
export async function loadRubrics(
  labFolder: string,
  families: readonly string[],
): Promise<Result<Map<string, Rubric>, string>> {
  const rubrics = new Map<string, Rubric>();
  for (const family of families) {
    const rubric = await loadRubric(labFolder, family);
    if (!rubric.ok) return rubric;
    rubrics.set(family, rubric.value);
  }
  return ok(rubrics);
}

// RF-1407
export async function loadJudgePrompt(promptsFolder: string): Promise<Result<PromptFile, string>> {
  try {
    return ok(await loadPromptFile(promptsFolder, JUDGE_PROMPT));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(`The judge prompt ${JUDGE_PROMPT} cannot be read: ${reason}`);
  }
}
