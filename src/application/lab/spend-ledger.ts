/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1402, ADR-029: the shared spend ledger of the phase.

export interface LedgerLimits {
  readonly totalCapMicros: number;
  readonly stopMicros: number;
  readonly invocationCapMicros: number;
}

export type LedgerLine =
  | {
      readonly v: 1;
      readonly t: 'hold';
      readonly id: string;
      readonly invocation: string;
      readonly micros: number;
      readonly at: number;
    }
  | {
      readonly v: 1;
      readonly t: 'settle';
      readonly id: string;
      readonly micros: number;
      readonly at: number;
    }
  | { readonly v: 1; readonly t: 'release'; readonly id: string; readonly at: number };

export interface HoldRefusal {
  readonly reason: 'invocation-cap' | 'stop-line' | 'phase-cap';
  readonly message: string;
}

export interface HoldTicket {
  readonly id: string;
}

export interface LedgerTotals {
  readonly spentMicros: number;
  readonly heldMicros: number;
}

export interface SpendLedger {
  hold(micros: number): Promise<Result<HoldTicket, HoldRefusal>>;
  settle(ticket: HoldTicket, micros: number): Promise<void>;
  release(ticket: HoldTicket): Promise<void>;
  totals(): Promise<LedgerTotals>;
}

export const HOLD_TTL_MS = 600_000;

export function parseLedgerText(_text: string): LedgerLine[] {
  throw new Error('not implemented');
}

export function ledgerTotals(_lines: readonly LedgerLine[], _now: number): LedgerTotals {
  throw new Error('not implemented');
}

export function decideHold(
  _lines: readonly LedgerLine[],
  _ownId: string,
  _limits: LedgerLimits,
  _now: number,
): Result<void, HoldRefusal> {
  throw new Error('not implemented');
}
