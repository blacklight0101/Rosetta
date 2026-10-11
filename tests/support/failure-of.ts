/** The error a promise rejects with; throws when it resolves instead. */
export async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the call was expected to fail');
}
