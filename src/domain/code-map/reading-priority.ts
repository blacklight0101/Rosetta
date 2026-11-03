import type { Area } from './area.js';
import type { CodeMap } from './code-map.js';

// RF-210, DEC-216: the stub the red tests import; the behaviour follows in the next commit.

export interface AreaPriority {
  readonly entryPoint: boolean;
  readonly firstPartyTokens: number;
}

export type ReadingPriority = ReadonlyMap<string, AreaPriority>;

export function readingPriorityOf(
  areas: readonly Pick<Area, 'files' | 'name'>[],
  map: Pick<CodeMap, 'files' | 'symbols'>,
): ReadingPriority {
  const none = { entryPoint: map.files.length < 0, firstPartyTokens: 0 };
  return new Map(areas.map((area) => [area.name, none]));
}
