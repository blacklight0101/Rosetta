import type { CallRow, CallStatus } from '../../api/call-schemas.js';

// RF-1011: the filters of the "API calls" panel. Plain functions of the calls the server sent.

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

/** An attempt that was retried, failed or refused by a cap: the ones the panel highlights. */
// RF-1011
export function isProblem(call: Pick<CallRow, 'status'>): boolean {
  return call.status !== 'ok';
}

function matchesStatus(call: CallRow, status: CallFilters['status']): boolean {
  if (status === '') return true;
  return status === 'problems' ? isProblem(call) : call.status === status;
}

// RF-1011
export function filterCalls(calls: readonly CallRow[], filters: CallFilters): readonly CallRow[] {
  return calls.filter(
    (call) =>
      (filters.provider === '' || call.provider === filters.provider) &&
      (filters.role === '' || call.role === filters.role) &&
      (filters.agent === '' || call.agent === filters.agent) &&
      matchesStatus(call, filters.status),
  );
}

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

// RF-1011
export function optionsOf(calls: readonly CallRow[]): CallOptions {
  return {
    providers: sortedUnique(calls.map((call) => call.provider)),
    roles: sortedUnique(calls.map((call) => call.role)),
    agents: sortedUnique(calls.map((call) => call.agent)),
  };
}

/** The `seq` of the next attempt that was not answered after `after`, from the first after the last. */
// RF-1011
export function nextProblemSeq(
  calls: readonly CallRow[],
  after: number | undefined,
): number | undefined {
  const problems = calls.filter(isProblem);
  const later = after === undefined ? undefined : problems.find((call) => call.seq > after);
  return (later ?? problems[0])?.seq;
}
