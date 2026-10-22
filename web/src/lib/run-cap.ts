import type { RunEstimate } from '../api/estimate-schemas.js';

// RF-1106, DEC-107 (P3-91): the run cap that applies on the start page. Scaffolding only.

/** True when a role of the estimate runs on the server's key. */
export function usesServerKeys(estimate: RunEstimate): boolean {
  throw new Error(`P3-91: not implemented for ${String(estimate.roles.length)} roles.`);
}

/** The cap a run is held to: the lower of the typed cap and, on server keys, the administrator's. */
export function effectiveRunCapMicros(input: {
  readonly typed: bigint;
  readonly administrator: bigint | undefined;
  readonly serverKeys: boolean;
}): bigint {
  throw new Error(`P3-91: not implemented for ${String(input.typed)}.`);
}
