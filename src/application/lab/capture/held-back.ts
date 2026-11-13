/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
// RF-1405: stub, the behaviour comes with the feature commit.

export type Sha256 = (text: string) => string;

// RF-1405
export function heldBackIds(
  _promptId: string,
  _ids: readonly string[],
  _sha256: Sha256,
): ReadonlySet<string> {
  return new Set();
}
