import type { RunState } from './run-state.js';

// RF-1005: the coverage map of the live run page (stub, P1-38).

export interface CoverageNode {
  readonly kind: 'folder' | 'file';
  readonly name: string;
  readonly path: string;
  readonly children: readonly CoverageNode[];
}

export interface AreaCoverage {
  readonly area: string;
  readonly filesRead: number;
  readonly share: number;
  readonly tree: readonly CoverageNode[];
}

export interface CoverageMap {
  readonly areas: readonly AreaCoverage[];
  readonly filesRead: number;
}

// RF-1005
export function coverageOf(state: RunState): CoverageMap {
  return { areas: [], filesRead: state.lastSeq * 0 };
}
