import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import {
  decideHold,
  ledgerTotals,
  parseLedgerText,
  type HoldRefusal,
  type HoldTicket,
  type LedgerLimits,
  type LedgerLine,
  type LedgerTotals,
  type SpendLedger,
} from '../../application/lab/spend-ledger.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1402, DEC-231, ADR-029: the spend ledger of the prompt lab as a file, `lab-out/ledger.jsonl`,
// shared by every lab command on the machine. Lines are only ever appended, each in one write and
// each led by a line break, so a line another process cut short never joins the next one; a command
// decides on the lines up to its own hold, read back after it was appended.

export interface FileSpendLedgerOptions {
  readonly file: string;
  readonly limits: LedgerLimits;
  /** Names the invocation in its holds, so its own cap counts only its own spend. */
  readonly invocation: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class FileSpendLedger implements SpendLedger {
  private readonly options: FileSpendLedgerOptions;

  constructor(options: FileSpendLedgerOptions) {
    this.options = options;
  }

  // RF-1402
  async hold(micros: number): Promise<Result<HoldTicket, HoldRefusal>> {
    const { invocation, limits } = this.options;
    const id = `${invocation}:${this.options.ids.uuid()}`;
    const at = this.now();
    await this.append({ v: 1, t: 'hold', id, invocation, micros, at });
    const lines = await this.lines();
    const decision = decideHold(lines, id, limits, at);
    if (decision.ok) return ok({ id });
    await this.append({ v: 1, t: 'release', id, at: this.now() });
    return err(decision.error);
  }

  async settle(ticket: HoldTicket, micros: number): Promise<void> {
    await this.append({ v: 1, t: 'settle', id: ticket.id, micros, at: this.now() });
  }

  async release(ticket: HoldTicket): Promise<void> {
    await this.append({ v: 1, t: 'release', id: ticket.id, at: this.now() });
  }

  async totals(): Promise<LedgerTotals> {
    return ledgerTotals(await this.lines(), this.now());
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }

  private async append(line: LedgerLine): Promise<void> {
    const { file } = this.options;
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `\n${JSON.stringify(line)}\n`, 'utf8');
  }

  private async lines(): Promise<LedgerLine[]> {
    try {
      return parseLedgerText(await readFile(this.options.file, 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }
}
