import type { Clock } from '../../src/application/ports/clock.js';

/** A clock that stands still until a test moves it. */
export class FixedClock implements Clock {
  private current: number;

  constructor(isoInstant: string) {
    this.current = new Date(isoInstant).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  set(isoInstant: string): void {
    this.current = new Date(isoInstant).getTime();
  }
}
