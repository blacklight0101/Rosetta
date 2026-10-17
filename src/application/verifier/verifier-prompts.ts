import type { PromptVersion } from '../../domain/runs/run-manifest.js';
import type { PromptFile } from '../agent/prompt-file.js';

// RF-301, RF-145, RNF-004: the prompt files of the verifier's judgement step. The system prompt
// holds the role, the data-block rule and the answer format and no repository text; the claim and
// its cited lines reach the model in the user message, as data blocks. The retry message names the
// problem of the answer that could not be read.

export interface VerifierPrompts {
  /** `verifier/claim.v<n>.md`: the verifier's role, the data-block rule and the answer format. */
  readonly system: PromptFile;
  /** `verifier/retry.v<n>.md`: the one retry after an answer that could not be read. */
  readonly retry: PromptFile;
}

/** The one placeholder the retry prompt must hold. */
export const verifierPlaceholders = { retry: '{{problem}}' } as const;

/** The retry message with the answer's problem in place of its placeholder. */
export function verifierRetryMessage(prompts: VerifierPrompts, problem: string): string {
  return prompts.retry.text.replace(verifierPlaceholders.retry, () => problem).trimEnd();
}

/** RNF-004: what the run manifest records about the verifier's prompts, by file name. */
export function verifierPromptVersions(prompts: VerifierPrompts): Record<string, PromptVersion> {
  return Object.fromEntries(
    [prompts.system, prompts.retry].map((file) => [
      file.name,
      { version: file.version, sha256: file.sha256 },
    ]),
  );
}
