import type { CallSinks } from '../../application/ports/provider-set-factory.js';
import type { Clock } from '../../application/ports/clock.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { unrecordedSinks } from './unrecorded-sinks.js';

// RF-142, RF-408, RF-141: the sinks of a model call that belongs to a project and to no run, such as
// the options of Plan setup. It has no run folder, so its egress line, provider-call record and
// masking counts go to `projects/<projectId>/plan-options/` of the owner's workspace.

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a stub until the logs are written
  _options: ProjectCallSinksOptions,
): (target: CallTarget) => CallSinks {
  return () => unrecordedSinks();
}
