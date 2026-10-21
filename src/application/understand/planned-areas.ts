import type { Area } from '../../domain/code-map/area.js';
import { isWorkbookSnapshotKey } from '../../domain/sources/workbook-key.js';
import { areaHoldsWorkbook } from '../../domain/sources/workbook-folders.js';

// RF-231 (Q-49), RF-155: the areas a run plans. A project of a single workbook has no `(root)` area:
// the root of its tree holds only `dependencies.md`, which says nothing a reader needs. With two or
// more workbooks the root is kept, because `dependencies.md` is then the map between them. A zip or a repository plans every area of its code map, even
// when the zip lists a workbook, because its root may hold code.

export interface PlannedFrom {
  readonly codeMap: { readonly areas: readonly Area[] };
  readonly source: { readonly snapshotKey: string };
  readonly workbookFolders?: readonly string[] | undefined;
}

// RF-231
export function plannedAreas(scanned: PlannedFrom): readonly Area[] {
  const { areas } = scanned.codeMap;
  const folders = scanned.workbookFolders ?? [];
  // Two or more workbooks: `dependencies.md` is the map between them and is read.
  if (!isWorkbookSnapshotKey(scanned.source.snapshotKey) || folders.length !== 1) return areas;
  return areas.filter((area) => areaHoldsWorkbook(area, folders));
}
