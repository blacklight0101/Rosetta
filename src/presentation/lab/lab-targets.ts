import type { LabTarget } from '../../application/lab/lab-target.js';
import { overviewTarget } from '../../application/lab/targets/overview-target.js';
import { verifierClaimTarget } from '../../application/lab/targets/verifier-claim-target.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { loadVerifierPrompts } from '../../infrastructure/prompts/verifier-prompt-files.js';

// RF-1401, ADR-029: the registry of the prompts the lab can run. To wire another prompt id: write
// its target in `src/application/lab/targets/` (the schema of its case input, the call of the run's
// own message builder, the run's parser) and add it here. The targets that need a prompt the lab
// does not vary (the verifier's retry message) take the run's current file, loaded here.

// RF-1401
export async function findLabTarget(
  promptsFolder: string,
  id: string,
): Promise<Result<LabTarget, string>> {
  const verifier = await loadVerifierPrompts(promptsFolder);
  const targets = [verifierClaimTarget(verifier.retry), overviewTarget()];
  const found = targets.find((target) => target.id === id);
  if (found !== undefined) return ok(found);
  const known = targets.map((target) => target.id).join(', ');
  return err(`The lab has no target for the prompt ${id}. Prompts it can run: ${known}.`);
}
