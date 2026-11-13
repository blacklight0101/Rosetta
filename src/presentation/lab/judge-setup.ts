import type { LabTarget } from '../../application/lab/lab-target.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { loadJudgePrompt, loadRubrics } from '../../infrastructure/lab/rubric-files.js';
import type { JudgeSetup } from './compose-judge.js';
import type { LabArgs } from './lab-args.js';

// RF-1404: the judge prompt and the rubric of the target's family, read before anything is sent, so
// a run with `--judge` and no rubric stops at the start. Without `--judge` there is no setup.

// RF-1404
export async function judgeSetupOf(
  args: Extract<LabArgs, { kind: 'run' }>,
  target: LabTarget,
  folders: { readonly labFolder: string; readonly promptsFolder: string },
): Promise<Result<JudgeSetup | undefined, string>> {
  if (args.judge === undefined) return ok(undefined);
  const family = target.id.split('/')[0] ?? target.id;
  const rubrics = await loadRubrics(folders.labFolder, [family]);
  if (!rubrics.ok) return err(rubrics.error);
  const prompt = await loadJudgePrompt(folders.promptsFolder);
  if (!prompt.ok) return err(prompt.error);
  return ok({ model: args.judge, prompt: prompt.value, rubrics: rubrics.value });
}
