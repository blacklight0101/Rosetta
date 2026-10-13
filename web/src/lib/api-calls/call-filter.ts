import type { CallRow, CallStatus } from '../../api/call-schemas.js';

// RF-1011: the filters of the "API calls" panel.

export interface CallFilters {
  /** Empty for any. */
  readonly provider: string;
  readonly role: string;
  readonly agent: string;
  /** A status, `problems` for every attempt that was not answered, or empty for any. */
  readonly status: CallStatus | 'problems' | '';
}

export const anyFilter: CallFilters = { provider: '', role: '', agent: '', status: '' };

export interface CallOptions {
  readonly providers: readonly string[];
  readonly roles: readonly string[];
  readonly agents: readonly string[];
}

// RF-1011
export function filterCalls(calls: readonly CallRow[], filters: CallFilters): readonly CallRow[] {
  void filters;
  return calls.slice(0, 0);
}

// RF-1011
export function optionsOf(calls: readonly CallRow[]): CallOptions {
  void calls;
  return { providers: [], roles: [], agents: [] };
}

/** The `seq` of the next attempt that was not answered after `after`, from the first after the last. */
// RF-1011
export function nextProblemSeq(calls: readonly CallRow[], after: number | undefined): number | undefined {
  void calls;
  void after;
  return undefined;
}
