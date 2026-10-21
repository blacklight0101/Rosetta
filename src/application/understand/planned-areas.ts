import type { Area } from '../../domain/code-map/area.js';

// RF-231 (Q-49): the areas a run plans.

export function plannedAreas(scanned: {
  readonly codeMap: { readonly areas: readonly Area[] };
  readonly snapshotKey: string;
  readonly workbookFolders?: readonly string[] | undefined;
}): readonly Area[] {
  return scanned.codeMap.areas;
}
