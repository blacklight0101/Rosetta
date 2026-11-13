import type { PromptFile } from '../../agent/prompt-file.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: the lab targets of the plan documents (red stub of the test commit).
export function planDocTargets(packagePrompt: PromptFile): LabTarget[] {
  return packagePrompt.text === '' ? [] : [];
}
