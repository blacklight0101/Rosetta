import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1402, ADR-007, ADR-029: the spend ledger of the prompt lab, shared by every lab command. The
// file is append-only JSON lines: a `hold` reserves the worst case of a call, a `settle` replaces
// it by the real cost, a `release` gives it back. A command judges its hold on the lines up to
// its own hold, so two commands that write at once never pass a cap together; a hold that is never
// settled stops counting after thirty minutes (a crashed command).

export interface LedgerLimits {
  readonly totalCapMicros: number;
  readonly stopMicros: number;
  readonly invocationCapMicros: number;
}

const micros = z.number().int().min(0);

const lineSchema = z.discriminatedUnion('t', [
  z.strictObject({
    v: z.literal(1),
    t: z.literal('hold'),
    id: z.string().min(1),
    invocation: z.string().min(1),
    micros,
    at: z.number(),
  }),
  z.strictObject({
    v: z.literal(1),
    t: z.literal('settle'),
    id: z.string().min(1),
    micros,
    at: z.number(),
  }),
  z.strictObject({
    v: z.literal(1),
    t: z.literal('release'),
    id: z.string().min(1),
    at: z.number(),
  }),
]);

export type LedgerLine = z.infer<typeof lineSchema>;

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
  /** Reserves `micros` for one call, or says which cap the call would pass. */
  hold(micros: number): Promise<Result<HoldTicket, HoldRefusal>>;
  /** Replaces the hold by what the call really cost. */
  settle(ticket: HoldTicket, micros: number): Promise<void>;
  /** Gives the hold back (the call failed, so its cost is unknown and not booked). */
  release(ticket: HoldTicket): Promise<void>;
  totals(): Promise<LedgerTotals>;
}

/**
 * How long a hold that is never settled keeps counting: longer than the longest call can run (the
 * reservation of the budget guard lasts about 24 minutes), so a call in flight is never forgotten.
 */
export const HOLD_TTL_MS = 1_800_000;

/** The lines of a ledger file; a torn or foreign line is left out. */
// RF-1402
export function parseLedgerText(text: string): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const parsed = lineSchema.safeParse(JSON.parse(raw));
      if (parsed.success) lines.push(parsed.data);
    } catch {
      // A line that is not JSON (a write cut short) is ignored.
    }
  }
  return lines;
}

interface Entry {
  readonly invocation: string;
  readonly micros: number;
  readonly state: 'held' | 'spent' | 'released';
  readonly at: number;
}

/** What each hold of the lines has become, by id. */
function entriesOf(lines: readonly LedgerLine[]): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  for (const line of lines) {
    if (line.t === 'hold') {
      const { invocation, at } = line;
      entries.set(line.id, { invocation, micros: line.micros, state: 'held', at });
      continue;
    }
    const before = entries.get(line.id);
    if (before === undefined) continue;
    if (line.t === 'release') entries.set(line.id, { ...before, state: 'released' });
    else entries.set(line.id, { ...before, micros: line.micros, state: 'spent' });
  }
  return entries;
}

interface Counted {
  readonly phase: number;
  readonly invocation: number;
}

function counted(entries: ReadonlyMap<string, Entry>, invocation: string, now: number): Counted {
  let phase = 0;
  let own = 0;
  for (const entry of entries.values()) {
    const live =
      entry.state === 'spent' || (entry.state === 'held' && now - entry.at <= HOLD_TTL_MS);
    if (!live) continue;
    phase += entry.micros;
    if (entry.invocation === invocation) own += entry.micros;
  }
  return { phase, invocation: own };
}

// RF-1402
export function ledgerTotals(lines: readonly LedgerLine[], now: number): LedgerTotals {
  let spentMicros = 0;
  let heldMicros = 0;
  for (const entry of entriesOf(lines).values()) {
    if (entry.state === 'spent') spentMicros += entry.micros;
    else if (entry.state === 'held' && now - entry.at <= HOLD_TTL_MS) heldMicros += entry.micros;
  }
  return { spentMicros, heldMicros };
}

const dollars = (value: number): string => `$${(value / 1_000_000).toFixed(2)}`;

/**
 * Whether the hold `ownId` may stand, judged on the lines up to and including it, against the cap of
 * its invocation, the total cap and the stop line, in that order (RF-1402).
 */
// RF-1402
export function decideHold(
  lines: readonly LedgerLine[],
  ownId: string,
  limits: LedgerLimits,
  now: number,
): Result<void, HoldRefusal> {
  const index = lines.findLastIndex((line) => line.t === 'hold' && line.id === ownId);
  const own = lines[index];
  if (own?.t !== 'hold')
    return err({ reason: 'phase-cap', message: 'The hold is not in the ledger.' });
  const total = counted(entriesOf(lines.slice(0, index + 1)), own.invocation, now);
  if (total.invocation > limits.invocationCapMicros) {
    const message = `This call would pass the invocation cap (${dollars(limits.invocationCapMicros)}).`;
    return err({ reason: 'invocation-cap', message });
  }
  if (total.phase > limits.totalCapMicros) {
    const message = `This call would pass the total cap of the phase (${dollars(limits.totalCapMicros)}).`;
    return err({ reason: 'phase-cap', message });
  }
  if (total.phase > limits.stopMicros) {
    const message = `This call would pass the stop line of the phase (${dollars(limits.stopMicros)}): the owner decides whether to go on.`;
    return err({ reason: 'stop-line', message });
  }
  return ok(undefined);
}
