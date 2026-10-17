import {
  recordManifestModelVersion,
  recordPromptVersions,
} from '../../domain/runs/run-manifest.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import type { ConsolidationParts } from './consolidate-cards.js';

// RF-250, RNF-004: what the summariser step takes from an understand run, and what it records in
// the manifest after its first answer: the merge prompt with its version and hash, and the model
// version the provider reports for the summariser role.

export interface ConsolidationSource {
  readonly summariser: RoleProvider;
  readonly mergePrompt: PromptFile;
  readonly logger: Logger;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly updates: ManifestUpdates;
  readonly nextCallId: () => string;
  readonly traceId: string;
  readonly runId: string;
  readonly signal: AbortSignal;
}

export function consolidationParts(source: ConsolidationSource): ConsolidationParts {
  const { summariser, mergePrompt, updates } = source;
  const { name, version, sha256 } = mergePrompt;
  const record = (response: LlmResponse): Promise<void> =>
    updates.update((manifest) => {
      const recorded = recordPromptVersions(manifest, { [name]: { version, sha256 } });
      return recordManifestModelVersion(recorded, 'summariser', response.modelVersion);
    });
  const { logger, ids, runId, traceId, nextCallId, signal } = source;
  return {
    ...{ provider: summariser.provider, role: summariser, prompt: mergePrompt, logger, ids },
    ...{ runId, traceId, nextCallId, signal, onAnswer: record },
  };
}
