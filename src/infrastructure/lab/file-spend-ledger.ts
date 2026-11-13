/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type {
  HoldRefusal,
  HoldTicket,
  LedgerLimits,
  LedgerTotals,
  SpendLedger,
} from '../../application/lab/spend-ledger.js';

// RF-1402, ADR-029: the ledger file shared by every lab command.

export interface FileSpendLedgerOptions {
  readonly file: string;
  readonly limits: LedgerLimits;
  readonly invocation: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class FileSpendLedger implements SpendLedger {
  constructor(_options: FileSpendLedgerOptions) {
    throw new Error('not implemented');
  }

  hold(_micros: number): Promise<Result<HoldTicket, HoldRefusal>> {
    throw new Error('not implemented');
  }

  settle(_ticket: HoldTicket, _micros: number): Promise<void> {
    throw new Error('not implemented');
  }

  release(_ticket: HoldTicket): Promise<void> {
    throw new Error('not implemented');
  }

  totals(): Promise<LedgerTotals> {
    throw new Error('not implemented');
  }
}
