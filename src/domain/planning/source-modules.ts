import type { FileEntry } from '../code-map/file-entry.js';
import type { SourceCard } from './plan-sources.js';

// P8-06, RF-601, EV-32: the modules of the analysed source (skeleton; the rule comes with the feature).

export const MAX_MODULES = 60;

export interface SourceModule {
  readonly path: string;
  readonly manifests: readonly string[];
  readonly languages: readonly string[];
  readonly files: number;
  readonly cards: readonly string[];
}

interface DeploymentMaterial {
  readonly paths: readonly string[];
  readonly files: number;
  readonly cards: readonly string[];
}

export interface SourceModules {
  readonly modules: readonly SourceModule[];
  readonly overCap: readonly SourceModule[];
  readonly deployment?: DeploymentMaterial;
}

// P8-06, RF-601
export function sourceModules(
  files: readonly FileEntry[],
  cards: readonly SourceCard[],
): SourceModules {
  return { modules: [], overCap: files.length + cards.length < 0 ? [] : [] };
}
