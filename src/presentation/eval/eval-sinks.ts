import { join } from 'node:path';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { ProviderSinks } from '../../application/ports/provider-set-factory.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { runPath } from '../../infrastructure/files/workspace-paths.js';
import { JsonlEgressLog } from '../../infrastructure/guards/jsonl-egress-log.js';
import type { TextMasker } from '../../infrastructure/guards/secret-masker.js';
import { JsonlProviderCallLog } from '../../infrastructure/providers/jsonl-provider-call-log.js';

// RF-408, RF-142: the provider call log and the egress log of each evaluation run, in its run
// folder, as the server writes them (compose-understand.ts).

export function composeUnderstandSinks(
  dataDir: string,
  writer: OutputWriter,
  masker: TextMasker,
): (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'> {
  return (scope) => ({
    recorder: new JsonlProviderCallLog({
      runDir: join(dataDir, 'users', scope.userId, runPath(scope.projectId, scope.runKey)),
      masker,
    }),
    egressLog: new JsonlEgressLog({ writer, masker, scope }),
  });
}
