// RF-1109, DEC-141 (P1-157, P1-49 F-01): how many `request.refused` rows one client address may
// write. An address gets up to `rowsPerWindow` rows in the minute that starts at its first refusal;
// the refusals past that are only counted, and the count is handed back once that minute has ended
// (or when the address is pushed out for room, or at `takeAll`), so the caller writes it as one row.
//
// Memory is bounded: at most `maxAddresses` addresses are kept. The map is in the order the
// addresses' minutes started, so a refusal only looks at the front for ended minutes (constant
// time); when the map is full, the address whose minute started first is pushed out and its count
// handed back at once. A pushed-out address that comes back starts a new minute, which costs the
// sender as much as a new address would. `takeEnded` (once a minute) scans every address, so an
// ended minute behind a newer one (a clock that went back) is still handed back.

export interface RefusalLimits {
  readonly rowsPerWindow: number;
  readonly windowMs: number;
  readonly maxAddresses: number;
}

export const REFUSAL_LIMITS: RefusalLimits = {
  rowsPerWindow: 30,
  windowMs: 60_000,
  maxAddresses: 10_000,
};

/** The refusals of one address in one minute that wrote no row of their own. */
export interface RefusalCount {
  readonly ip: string;
  readonly windowStartMs: number;
  readonly count: number;
}

export interface Admission {
  /** True when this refusal writes its own row. */
  readonly write: boolean;
  /** Counts of minutes that ended (or were pushed out); the caller writes one row for each. */
  readonly ended: readonly RefusalCount[];
}

interface Window {
  readonly startMs: number;
  written: number;
  suppressed: number;
}

export class RefusalLimiter {
  private readonly limits: RefusalLimits;
  private readonly windows = new Map<string, Window>();

  constructor(limits: RefusalLimits = REFUSAL_LIMITS) {
    this.limits = limits;
  }

  /** How many addresses are kept; never more than `maxAddresses`. */
  get size(): number {
    return this.windows.size;
  }

  // RF-1109, DEC-141
  admit(ip: string, nowMs: number): Admission {
    const ended = this.takeEndedAtFront(nowMs);
    const window = this.windowOf(ip, nowMs, ended);
    if (window.written < this.limits.rowsPerWindow) {
      window.written += 1;
      return { write: true, ended };
    }
    window.suppressed += 1;
    return { write: false, ended };
  }

  /** Removes every address whose minute has ended and hands back the non-zero counts. */
  takeEnded(nowMs: number): RefusalCount[] {
    const ended: RefusalCount[] = [];
    for (const [ip, window] of this.windows) {
      if (this.hasEnded(window, nowMs)) this.remove(ip, window, ended);
    }
    return ended;
  }

  /** Removes every address and hands back the non-zero counts, ended or not (shutdown). */
  takeAll(): RefusalCount[] {
    const all: RefusalCount[] = [];
    for (const [ip, window] of this.windows) this.remove(ip, window, all);
    return all;
  }

  private windowOf(ip: string, nowMs: number, ended: RefusalCount[]): Window {
    const known = this.windows.get(ip);
    if (known !== undefined && !this.hasEnded(known, nowMs)) return known;
    if (known !== undefined) this.remove(ip, known, ended);
    this.makeRoom(ended);
    const window: Window = { startMs: nowMs, written: 0, suppressed: 0 };
    this.windows.set(ip, window);
    return window;
  }

  private takeEndedAtFront(nowMs: number): RefusalCount[] {
    const ended: RefusalCount[] = [];
    for (const [ip, window] of this.windows) {
      if (!this.hasEnded(window, nowMs)) break;
      this.remove(ip, window, ended);
    }
    return ended;
  }

  private makeRoom(ended: RefusalCount[]): void {
    for (const [ip, window] of this.windows) {
      if (this.windows.size < this.limits.maxAddresses) return;
      this.remove(ip, window, ended);
    }
  }

  private hasEnded(window: Window, nowMs: number): boolean {
    return nowMs - window.startMs >= this.limits.windowMs;
  }

  private remove(ip: string, window: Window, counts: RefusalCount[]): void {
    this.windows.delete(ip);
    if (window.suppressed > 0) {
      counts.push({ ip, windowStartMs: window.startMs, count: window.suppressed });
    }
  }
}
