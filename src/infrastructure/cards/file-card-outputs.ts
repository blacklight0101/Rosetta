import type { CardOutputs, CardSet } from '../../application/ports/card-outputs.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-204, RF-302, RNF-002: the card files of a run through the OutputWriter.

export interface FileCardOutputsOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly logger: Logger;
}

export class FileCardOutputs implements CardOutputs {
  private readonly options: FileCardOutputsOptions;

  constructor(options: FileCardOutputsOptions) {
    this.options = options;
  }

  writeCards(_scope: RunScope, _set: CardSet): Promise<void> {
    return Promise.resolve();
  }

  writeInvalidOutput(
    _scope: RunScope,
    _agentTaskId: string,
    _rawOutputs: readonly string[],
  ): Promise<void> {
    return Promise.resolve();
  }
}
