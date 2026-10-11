import { afterEach, beforeEach, vi } from 'vitest';
import { SystemClock } from '../../../../src/infrastructure/system/system-clock.js';
import { clockContract } from '../../../contracts/clock.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

clockContract('SystemClock', () => new SystemClock());
clockContract('FixedClock', () => new FixedClock('2026-10-11T09:05:03.007Z'));
