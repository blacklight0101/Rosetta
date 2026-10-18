import type { Citation } from '../cards/citation.js';
import type { SourceCard } from './plan-sources.js';

// RF-632, DEC-135: skeleton.

export interface StatedVolume {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
}

export function statedVolumes(sources: readonly SourceCard[]): StatedVolume[] {
  return sources.length < 0 ? [] : [];
}
