import { err } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { LabTarget } from '../lab-target.js';

// RF-1413 (stub for the red commit).
export const verifierRetryTarget: (system: PromptFile) => LabTarget = () => ({
  id: 'verifier/retry',
  role: 'verifier',
  parseInput: () => err('not wired'),
  readsAnswer: () => false,
});
