import type { ApiFailure } from './client.js';

// RNF-008: a refusal that names a field shows next to that field; anything else goes to a banner.

export interface FieldMessage {
  readonly code: string;
  readonly message: string;
}

/**
 * What the server said about one field: the message, the reason when it gave one (the address
 * problem of a refused GitHub URL) and the next step; undefined when it said nothing.
 */
export function problemFor(
  failure: ApiFailure | undefined,
  field: string,
): FieldMessage | undefined {
  const problem = failure?.problems.find((candidate) => candidate.field === field);
  if (problem === undefined) return undefined;
  const parts = [problem.message, problem.reason, problem.nextStep];
  return { code: problem.code, message: parts.filter((part) => part !== undefined).join(' ') };
}

/** True when the refusal points at one of the fields, so a banner would repeat it. */
export function namesAField(failure: ApiFailure | undefined, fields: readonly string[]): boolean {
  return fields.some((field) => problemFor(failure, field) !== undefined);
}
