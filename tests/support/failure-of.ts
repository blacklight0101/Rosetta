import { RosettaError } from '../../src/domain/errors/rosetta-error.js';

/** The error a promise rejects with; throws when it resolves instead. */
export async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the call was expected to fail');
}

/** The next step a RosettaError names; empty for any other error. */
export function nextStepOf(error: unknown): string {
  return error instanceof RosettaError ? error.nextStep : '';
}
