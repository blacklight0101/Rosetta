import { describe, expect, it } from 'vitest';
import { parseLabConfig } from '../../../../src/application/lab/lab-config.js';

// RF-1402, DEC-231: `lab/config.json` holds the phase caps and the cap of one invocation, in micros.

const valid = {
  schemaVersion: 1,
  totalCapMicros: 50_000_000,
  stopMicros: 40_000_000,
  invocationCapMicros: 5_000_000,
};

describe('the lab settings', () => {
  it('RF-1402 reads the total cap, the stop line and the cap of one invocation', () => {
    expect(parseLabConfig(valid)).toEqual({ ok: true, value: valid });
  });

  it('RF-1402 refuses a stop line above the total cap', () => {
    const result = parseLabConfig({ ...valid, stopMicros: 60_000_000 });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('stopMicros');
  });

  it('RF-1402 refuses an invocation cap above the stop line and an unknown key', () => {
    expect(parseLabConfig({ ...valid, invocationCapMicros: 45_000_000 }).ok).toBe(false);
    expect(parseLabConfig({ ...valid, extra: 1 }).ok).toBe(false);
  });
});
