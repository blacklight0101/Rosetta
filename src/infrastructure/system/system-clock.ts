import type { Clock } from '../../application/ports/clock.js';

// RNF-004
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
