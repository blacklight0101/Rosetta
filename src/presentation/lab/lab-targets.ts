import type { LabTarget } from '../../application/lab/lab-target.js';
import { cardSurfaceTargets } from '../../application/lab/targets/card-surface-targets.js';
import { cardsRepairTarget } from '../../application/lab/targets/cards-repair-target.js';
import { gapTarget } from '../../application/lab/targets/gap-target.js';
import { mergeTarget } from '../../application/lab/targets/merge-target.js';
import { planDocTargets } from '../../application/lab/targets/plan-doc-targets.js';
import { overviewTarget } from '../../application/lab/targets/overview-target.js';
import { repairTargets } from '../../application/lab/targets/repair-targets.js';
import { readerPartTargets } from '../../application/lab/targets/reader-part-targets.js';
import { readerTargets } from '../../application/lab/targets/reader-targets.js';
import { sharedTargets, type SharedKit } from '../../application/lab/targets/shared-targets.js';
import { verifierClaimTarget } from '../../application/lab/targets/verifier-claim-target.js';
import { verifierRetryTarget } from '../../application/lab/targets/verifier-retry-target.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import {
  maskedKindPlaceholder,
  maskedValueReplacement,
} from '../../infrastructure/prompts/masked-value-prompt.js';
import {
  loadGapPrompt,
  loadPlannerPrompt,
  loadReaderPrompts,
} from '../../infrastructure/prompts/prompt-files.js';
import {
  parseTextAnswer,
  textProtocolSystem,
  toolsPlaceholder,
  toolCallBlock,
  toolResultBlock,
} from '../../infrastructure/providers/ollama/text-tool-protocol.js';
import { loadVerifierPrompts } from '../../infrastructure/prompts/verifier-prompt-files.js';

// RF-1401, RF-1406, ADR-029: the registry of the prompts the lab can run. To wire another prompt id:
// write its target in `src/application/lab/targets/` (the schema of its case input, the call of the
// run's own message builder, the run's parser) and add it here, then mark it `wired` in the runbook
// (section 7). The targets that need a prompt the lab does not vary (the verifier's retry message,
// the rest of the reader's prompts, the system prompts of the calls the planner repairs) take the
// run's current files, loaded here.

/**
 * What the shared targets take from the infrastructure (P10-10): the run's masker with the file under
 * test as its replacement, and the text protocol the Ollama adapter uses.
 */
const sharedKit: SharedKit = {
  maskerOf: (file) =>
    file.text.split(maskedKindPlaceholder).length === 2
      ? new SecretMasker(undefined, maskedValueReplacement(file))
      : undefined,
  protocol: {
    toolsPlaceholder,
    systemOf: textProtocolSystem,
    parse: parseTextAnswer,
    toolCallBlock,
    toolResultBlock,
  },
};

/** Every target the lab has. */
// RF-1406
export async function listLabTargets(promptsFolder: string): Promise<LabTarget[]> {
  const verifier = await loadVerifierPrompts(promptsFolder);
  const reader = await loadReaderPrompts(promptsFolder);
  const planner = await loadPlannerPrompt(promptsFolder);
  const gap = await loadGapPrompt(promptsFolder);
  return [
    verifierClaimTarget(verifier.retry),
    verifierRetryTarget(verifier.system),
    overviewTarget(),
    gapTarget(),
    ...planDocTargets(planner),
    ...repairTargets({ gap, plan: planner }),
    mergeTarget(),
    ...readerTargets(reader),
    ...readerPartTargets(reader),
    ...cardSurfaceTargets(reader),
    cardsRepairTarget(reader),
    ...sharedTargets(reader, sharedKit),
  ];
}

// RF-1401
export async function findLabTarget(
  promptsFolder: string,
  id: string,
): Promise<Result<LabTarget, string>> {
  const targets = await listLabTargets(promptsFolder);
  const found = targets.find((target) => target.id === id);
  if (found !== undefined) return ok(found);
  const known = targets.map((target) => target.id).join(', ');
  return err(`The lab has no target for the prompt ${id}. Prompts it can run: ${known}.`);
}
