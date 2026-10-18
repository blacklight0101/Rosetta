import type { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunOutcome } from '../ports/run-executor.js';
import type { ProviderSet } from '../providers/provider-set.js';
import type { UnderstandRoles } from './run-understand-types.js';

// RF-200, RF-1108: the small steps of the understand executor: a failed end, a step that either
// gives a value or ends the run, and the three roles an understand run calls.

export const failed = (code: RosettaError['code']): RunOutcome => ({
  endState: 'Failed',
  errorCode: code,
});

export function understandRolesOf(set: ProviderSet): UnderstandRoles | undefined {
  const reader = set.get('reader');
  const verifier = set.get('verifier');
  const summariser = set.get('summariser');
  if (reader === undefined || verifier === undefined || summariser === undefined) return undefined;
  return { reader, verifier, summariser };
}

export type Step<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly outcome: RunOutcome };

export function stop(outcome: RunOutcome): { readonly ok: false; readonly outcome: RunOutcome } {
  return { ok: false, outcome };
}
