import { err, ok, type Result } from '../errors/result.js';
import { byCodeUnit } from './code-unit-order.js';
import type { FileEntry } from './file-entry.js';
import type { MapLevel } from './map-level.js';

// RF-104, RF-112: an area is a group of files small enough for one agent task (data-model 3.4).

/** The longest area name the code map holds (a folder path, RF-104); the API limits follow it. */
export const MAX_AREA_NAME_LENGTH = 1024;

/** How the files of an area were grouped: by folder, by language-pack references, or by settings. */
export type AreaOrigin = 'config' | 'folder' | 'references';

export interface Area {
  readonly name: string;
  /** Paths, sorted. */
  readonly files: readonly string[];
  readonly estimatedTokens: number;
  /** `symbols` when at least one file was mapped by a language pack. */
  readonly mapLevel: MapLevel;
  readonly origin: AreaOrigin;
}

export interface AreaDraft {
  readonly name: string;
  readonly origin: AreaOrigin;
  readonly members: readonly FileEntry[];
}

export type AreaProblem =
  'duplicate-file' | 'empty-area' | 'empty-name' | 'invalid-budget' | 'over-budget';

function hasDuplicates(paths: readonly string[]): boolean {
  return new Set(paths).size !== paths.length;
}

/**
 * Builds an area from its member files. The token total is at most `tokenBudget`, except for an
 * area made of one file that is larger than the budget on its own: a file is never cut (RF-104).
 */
export function createArea(draft: AreaDraft, tokenBudget: number): Result<Area, AreaProblem> {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) return err('invalid-budget');
  if (draft.name === '') return err('empty-name');
  if (draft.members.length === 0) return err('empty-area');
  const files = draft.members.map((member) => member.path).sort(byCodeUnit);
  if (hasDuplicates(files)) return err('duplicate-file');
  const estimatedTokens = draft.members.reduce((sum, member) => sum + member.estimatedTokens, 0);
  if (estimatedTokens > tokenBudget && files.length > 1) return err('over-budget');
  const mapLevel = draft.members.some((member) => member.mapLevel === 'symbols')
    ? 'symbols'
    : 'coarse';
  return ok({ name: draft.name, files, estimatedTokens, mapLevel, origin: draft.origin });
}
