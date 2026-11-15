import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSpendLedger } from '../../../../src/infrastructure/lab/file-spend-ledger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { labLimits } from '../../../support/lab-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1402, ADR-029: the ledger file is append-only JSON lines shared by every lab command.

const temp = useTempRoot('rosetta-lab-ledger-');
const start = '2026-11-13T09:00:00Z';

function ledger(invocation: string, limits = labLimits, clock = new FixedClock(start)) {
  return new FileSpendLedger({
    file: join(temp.path, 'lab-out', 'ledger.jsonl'),
    ...{ limits, invocation, clock },
    ids: new SequenceIdGenerator(),
  });
}

const file = (): string => join(temp.path, 'lab-out', 'ledger.jsonl');

describe('the file spend ledger', () => {
  it('RF-1402 holds, settles and releases, and totals what was spent', async () => {
    const book = ledger('inv-a');

    const first = await book.hold(1_000);
    const second = await book.hold(2_000);
    if (!first.ok || !second.ok) throw new Error('refused');
    await book.settle(first.value, 700);
    await book.release(second.value);

    expect(await book.totals()).toEqual({ spentMicros: 700, heldMicros: 0 });
    const written = (await readFile(file(), 'utf8')).split('\n').filter((line) => line !== '');
    expect(written).toHaveLength(4);
  });

  it('RF-1402 refuses a hold past the cap of its invocation and releases it', async () => {
    const book = ledger('inv-a', { ...labLimits, invocationCapMicros: 1_500 });

    const first = await book.hold(1_000);
    const second = await book.hold(1_000);

    expect(first.ok).toBe(true);
    expect(second.ok ? undefined : second.error.reason).toBe('invocation-cap');
    expect(await book.totals()).toEqual({ spentMicros: 0, heldMicros: 1_000 });
  });

  it('RF-1402 lets two commands that write at once pass the stop line together never', async () => {
    const limits = { ...labLimits, stopMicros: 1_500, invocationCapMicros: 1_500 };

    const [left, right] = await Promise.all([
      ledger('inv-a', limits).hold(1_000),
      ledger('inv-b', limits).hold(1_000),
    ]);

    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe('the file spend ledger over time', () => {
  it('RF-1402 keeps counting an unsettled hold for thirty minutes and then stops', async () => {
    const clock = new FixedClock(start);
    const limits = { ...labLimits, stopMicros: 1_500, invocationCapMicros: 1_500 };
    await ledger('inv-a', limits, clock).hold(1_000);

    const early = await ledger('inv-b', limits, clock).hold(1_000);
    clock.advance(20 * 60_000);
    const middle = await ledger('inv-b', limits, clock).hold(1_000);
    clock.advance(10 * 60_000 + 1);
    const late = await ledger('inv-b', limits, clock).hold(1_000);

    expect(early.ok).toBe(false);
    expect(middle.ok).toBe(false);
    expect(late.ok).toBe(true);
  });

  it('RF-1402 refuses every call once the phase has reached the stop line', async () => {
    const book = ledger('inv-a');
    const probe = await book.hold(1);
    if (!probe.ok) throw new Error('refused');
    await book.settle(probe.value, 40_000_000);

    const next = await ledger('inv-b').hold(1);

    expect(next.ok ? undefined : next.error.reason).toBe('stop-line');
  });

  it('RF-1402 ignores a torn last line of the file', async () => {
    const book = ledger('inv-a');
    const first = await book.hold(1_000);
    if (!first.ok) throw new Error('refused');
    await writeFile(file(), `${await readFile(file(), 'utf8')}{"v":1,"t":"ho`);

    expect(await book.totals()).toEqual({ spentMicros: 0, heldMicros: 1_000 });
  });
});
