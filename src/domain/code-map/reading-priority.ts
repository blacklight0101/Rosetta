import type { Area } from './area.js';
import { surfaceReaderOf } from './area-surface.js';
import type { CodeMap } from './code-map.js';
import { isThirdPartyFile } from './third-party.js';

// RF-210, DEC-216: what the reader order needs to know about each area beyond its name. Inside the
// application's own code, an area with an entry point (the marks of area-surface.ts) is read before
// one without, and a larger first-party token count before a smaller one. Vendored libraries and
// minified bundles inside a mixed area do not count as its size.

interface AreaPriority {
  readonly entryPoint: boolean;
  readonly firstPartyTokens: number;
}

/** The priority of each area, by area name. */
export type ReadingPriority = ReadonlyMap<string, AreaPriority>;

// RF-210
export function readingPriorityOf(
  areas: readonly Pick<Area, 'files' | 'name'>[],
  map: Pick<CodeMap, 'files' | 'symbols'>,
): ReadingPriority {
  const known = new Map(map.files.map((file) => [file.path, file]));
  const surfaceOf = surfaceReaderOf(map);
  return new Map(
    areas.map((area) => {
      const own = area.files.flatMap((path) => {
        const file = known.get(path);
        return file === undefined || isThirdPartyFile(file) ? [] : [file.estimatedTokens];
      });
      const firstPartyTokens = own.reduce((sum, tokens) => sum + tokens, 0);
      const entryPoint = surfaceOf(area).entryPoints.length > 0;
      return [area.name, { entryPoint, firstPartyTokens }];
    }),
  );
}
