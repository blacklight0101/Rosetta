import {
  verifierPlaceholders,
  type VerifierPrompts,
} from '../../application/verifier/verifier-prompts.js';
import { loadPromptFile, requirePlaceholder } from './prompt-files.js';

// RF-301, RNF-004, RF-145: the verifier's prompt files under the prompts folder, read once with
// the SHA-256 of their bytes, refused when one holds a data block marker or the retry prompt lost
// its placeholder. A change creates a new version file and the names below change with it.

const verifierPromptNames = {
  system: 'verifier/claim.v4.md',
  retry: 'verifier/retry.v1.md',
} as const;

// RF-301, RNF-004
export async function loadVerifierPrompts(promptsFolder: string): Promise<VerifierPrompts> {
  const [system, retry] = await Promise.all([
    loadPromptFile(promptsFolder, verifierPromptNames.system),
    loadPromptFile(promptsFolder, verifierPromptNames.retry),
  ]);
  return { system, retry: requirePlaceholder(retry, verifierPlaceholders.retry) };
}
