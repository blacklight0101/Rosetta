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
