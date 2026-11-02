import type { CodeMap } from '../../domain/code-map/code-map.js';
import { areaHoldsWorkbook } from '../../domain/sources/workbook-folders.js';
import { surfaceOf } from '../../domain/code-map/area-surface.js';
import type { Area } from '../../domain/code-map/area.js';
import { readingOrder } from '../understand/reader-order.js';
import type { RunEstimate } from './estimate-types.js';

// RF-425, RF-200, P3-112, P3-123: the areas the estimate before an understand run covers and offers.

/**
 * RF-626: the screens of the areas, taken to be one SCRN card for each page file the code map marks
 * (the same marks as the reader prompt, Q-25); each card adds its claims as verifier calls.
 */
export function screensOf(areas: readonly Area[], codeMap: CodeMap): number {
  return areas.reduce((total, area) => total + surfaceOf(area, codeMap).pages.length, 0);
}

/** RF-155: the areas that hold a rendered workbook also resend the guidance and both formats. */
export function workbookAreaNames(
  areas: readonly Area[],
  folders: readonly string[] | undefined,
): ReadonlySet<string> {
  return new Set(areas.filter((area) => areaHoldsWorkbook(area, folders)).map((area) => area.name));
}

/**
 * P3-112: the areas the start page offers. One with no readable file (zero tokens) is left out. It
 * is filtered here, not in plannedAreas, so a run stored before this change still resumes.
 */
export function offeredAreas(
  areas: readonly Area[],
  thirdParty: ReadonlySet<string>,
): RunEstimate['areas'] {
  return areas
    .filter((area) => area.estimatedTokens > 0)
    .map(({ name, estimatedTokens, files }) => ({
      ...{ name, estimatedTokens, files: files.length },
      thirdParty: thirdParty.has(name),
    }));
}

/**
 * P3-123: with no area list the figures are for the default (own code), but the list still offers
 * every area, because the start page builds its picker from it.
 */
export function offeredFor(
  planned: readonly Area[],
  covered: readonly Area[],
  requested: readonly string[] | undefined,
  thirdParty: ReadonlySet<string>,
): readonly Area[] {
  const ordered = readingOrder(planned, thirdParty); // RF-210: the readers' order
  return (requested ?? []).length > 0 ? ordered.filter((area) => covered.includes(area)) : ordered;
}
