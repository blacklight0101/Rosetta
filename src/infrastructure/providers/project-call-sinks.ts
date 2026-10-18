import { join } from 'node:path';
import type { Clock } from '../../application/ports/clock.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { CallSinks } from '../../application/ports/provider-set-factory.js';
import { JsonlEgressLog } from '../guards/jsonl-egress-log.js';
import { JsonlSecurityLog } from '../guards/jsonl-security-log.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { planOptionsPath, projectPath, workspaceRoot } from '../files/workspace-paths.js';
import { JsonlProviderCallLog } from './jsonl-provider-call-log.js';

// RF-142, RF-408, RF-141, RF-005: the sinks of a model call that belongs to a project and to no run,
// such as the options of Plan setup. It has no run folder, so its egress line, provider-call record
// and masking counts go to `projects/<projectId>/plan-options/` of the owner's workspace. The
// lines are masked as the logs of a run are, only the owner's workspace can reach them, and the
// folder is part of the project's, so deleting the project deletes them.

export interface ProjectCallSinksOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly clock: Clock;
  /** The data folder; the owner's workspace is `<dataDir>/users/<userId>`. */
  readonly dataDir: string;
}

export interface CallTarget {
  readonly userId: string;
  readonly projectId: string;
}

// RF-142, RF-408
export function projectCallSinks(
  options: ProjectCallSinksOptions,
): (target: CallTarget) => CallSinks {
  const { writer, masker, clock, dataDir } = options;
  return ({ userId, projectId }) => {
    const folder = planOptionsPath(projectId);
    const runDir = join(
      workspaceRoot(dataDir, userId),
      ...projectPath(projectId).split('/'),
      'plan-options',
    );
    return {
      recorder: new JsonlProviderCallLog({ runDir, masker }),
      egressLog: new JsonlEgressLog({ writer, masker, userId, folder }),
      security: new JsonlSecurityLog({ writer, clock, userId, folder }),
    };
  };
}
