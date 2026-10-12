import type { Area } from '../../domain/code-map/area.js';
import type { ByScenario } from './estimate-types.js';
import type { EstimateAssumptions } from './estimate-types.js';

export interface TokenFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// RF-425: the stub of the reader's token estimate.
export function readerTokens(
  _areas: readonly Area[],
  _assumptions: EstimateAssumptions,
): ByScenario<TokenFigures> {
  const none = { inputTokens: 0, outputTokens: 0 };
  return { low: none, likely: none, high: none };
}
