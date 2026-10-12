import type { EgressLog, EgressRecord } from '../../application/ports/egress-log.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { TextMasker } from './secret-masker.js';

export interface JsonlEgressLogOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly scope: RunScope;
}

export class JsonlEgressLog implements EgressLog {
  constructor(_options: JsonlEgressLogOptions) {}

  append(_record: EgressRecord): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }
}
