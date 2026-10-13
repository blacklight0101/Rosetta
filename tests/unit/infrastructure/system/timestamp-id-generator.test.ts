import { describe, expect, it } from 'vitest';
import { TimestampIdGenerator } from '../../../../src/infrastructure/system/timestamp-id-generator.js';
import { FixedClock } from '../../../support/fixed-clock.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('TimestampIdGenerator', () => {
  it('RNF-004 builds run ids as yyyyMMdd-HHmmss-<stage> in UTC', () => {
    const clock = new FixedClock('2026-10-11T09:05:03.007Z');

    expect(new TimestampIdGenerator(clock).runId('scan')).toBe('20261011-090503-scan');
  });

  it('RNF-004 pads single-digit parts and follows the clock', () => {
    const clock = new FixedClock('2026-01-02T03:04:05.000Z');
    const ids = new TimestampIdGenerator(clock);

    expect(ids.runId('understand')).toBe('20260102-030405-understand');
    clock.advance(61_000);
    expect(ids.runId('report')).toBe('20260102-030506-report');
  });

  it('RNF-004 produces version 4 UUIDs that differ on each call', () => {
    const ids = new TimestampIdGenerator(new FixedClock('2026-10-11T09:05:03.007Z'));
    const first = ids.uuid();

    expect(first).toMatch(UUID_V4);
    expect(ids.uuid()).not.toBe(first);
  });
});

// RF-145, DEC-129: a block tag must be unpredictable, or a repository could write the closing line
// of the block it sits in. A counter, a clock value or a per-instance sequence fails these checks
// (SequenceIdGenerator, the test fake, is predictable on purpose and is not held to them).
describe('TimestampIdGenerator data-block tags', () => {
  const instant = '2026-10-11T09:05:03.007Z';
  const TAG_COUNT = 64;

  it('RF-145 gives two generators on the same clock different first tags', () => {
    const first = new TimestampIdGenerator(new FixedClock(instant)).dataBlockTag();
    const second = new TimestampIdGenerator(new FixedClock(instant)).dataBlockTag();

    expect(first).not.toBe(second);
  });

  it('RF-145 varies every character position across tags', () => {
    const ids = new TimestampIdGenerator(new FixedClock(instant));
    const tags = Array.from({ length: TAG_COUNT }, () => ids.dataBlockTag());

    const constant = Array.from({ length: 24 }, (_, position) => position).filter(
      (position) => new Set(tags.map((tag) => tag.charAt(position))).size === 1,
    );

    expect(new Set(tags).size).toBe(TAG_COUNT);
    expect(constant).toEqual([]);
  });

  it('RF-145 gives tags that do not come out in counting order', () => {
    const ids = new TimestampIdGenerator(new FixedClock(instant));
    const tags = Array.from({ length: TAG_COUNT }, () => ids.dataBlockTag());

    expect(tags).not.toEqual([...tags].sort());
  });
});
