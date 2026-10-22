import type { RunEstimate } from '../api/estimate-schemas.js';

// RF-1106, DEC-107 (P3-91): the run cap that applies on the start page and in the project settings.
// A run on the server's keys is held to the administrator's run cap when it is lower than the
// project's; a run on the user's own key, or a local model, is held to the project's cap alone.

/** True when a role of the estimate runs on the server's key. */
export function usesServerKeys(estimate: RunEstimate): boolean {
  return estimate.roles.some((role) => role.keySource === 'server');
}

/** The cap a run is held to: the lower of the typed cap and, on server keys, the administrator's. */
export function effectiveRunCapMicros(input: {
  readonly typed: bigint;
  readonly administrator: bigint | undefined;
  readonly serverKeys: boolean;
}): bigint {
  const { typed, administrator, serverKeys } = input;
  return serverKeys && administrator !== undefined && administrator < typed ? administrator : typed;
}
