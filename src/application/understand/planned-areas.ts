import type { Area } from '../../domain/code-map/area.js';
import { isWorkbookSnapshotKey } from '../../domain/sources/workbook-key.js';
import { areaHoldsWorkbook } from '../../domain/sources/workbook-folders.js';

// RF-231 (Q-49), RF-155: the areas a run plans. A workbook project has no `(root)` area when its
// root holds no workbook file: the root of its tree holds only `dependencies.md`, which no reader
// can explain without the workbooks. A zip or a repository plans every area of its code map, even
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
  if (!isWorkbookSnapshotKey(scanned.source.snapshotKey) || folders.length === 0) return areas;
  return areas.filter((area) => areaHoldsWorkbook(area, folders));
}
