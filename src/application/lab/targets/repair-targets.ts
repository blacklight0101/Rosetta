import type { PromptFile } from '../../agent/prompt-file.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: the targets of the planner's repair prompts; not written yet.

// RF-1406
export function repairTargets(prompts: { gap: PromptFile; plan: PromptFile }): LabTarget[] {
  return [prompts.gap, prompts.plan].flatMap((): LabTarget[] => []);
}
