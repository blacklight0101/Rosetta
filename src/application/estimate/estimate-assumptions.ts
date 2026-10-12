import type { ProjectSettings } from '../projects/project-settings.js';
import type { EstimateAssumptions } from './estimate-types.js';

// RF-425: the stub of the assumptions; the real numbers come with the implementation.
export function assumptionsOf(_settings: ProjectSettings): EstimateAssumptions {
  const none = { low: 0, likely: 0, high: 0 } as const;
  return {
    turnsPerArea: none,
    outputTokensPerTurn: none,
    readSharePercent: none,
    verifierSharePercent: none,
    promptOverheadTokens: 0,
    contextLimitTokens: 0,
    parallelism: 0,
    cachedInputPercent: 0,
  };
}
