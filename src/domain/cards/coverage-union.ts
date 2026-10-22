import {
  areaCoverage,
  type AreaCoverage,
  type CoverageArea,
  type CoverageFile,
  type LineRange,
} from './area-coverage.js';

// RF-230, RF-209: the coverage of a run whose areas were read by more than one task (a Deepen reads
// the cited files of rejected claims and the files no task read again). The lines read of a file
// are the union of every task's, and each area of the run is listed once, in the order the
// entries first name it, with what its first entry says about it (a failure, a note, its flows
// and screens).

/** The line ranges every entry read, per file path (not yet merged). */
export function readsByPath(entries: readonly AreaCoverage[]): ReadonlyMap<string, LineRange[]> {
  const reads = new Map<string, LineRange[]>();
  for (const entry of entries) {
    for (const file of entry.files) {
      reads.set(file.path, [...(reads.get(file.path) ?? []), ...file.read]);
    }
  }
  return reads;
}

/**
 * What the first entry of an area says beside its lines. A failure is kept only while every task of
 * the area failed: an area a Deepen read again without failing has recovered (RF-209).
 */
function extrasOf(entry: AreaCoverage, recovered: boolean): Partial<AreaCoverage> {
  const { failure, surface, note } = entry;
  return {
    ...(failure === undefined || recovered ? {} : { failure }),
    ...(surface === undefined ? {} : { surface }),
    ...(note === undefined ? {} : { note }),
  };
}

// RF-230
export function unionCoverage(
  entries: readonly AreaCoverage[],
  areas: readonly CoverageArea[],
  files: readonly CoverageFile[],
): readonly AreaCoverage[] {
  const reads = readsByPath(entries);
  const byName = new Map(areas.map((area) => [area.name, area]));
  const listed = new Map<string, AreaCoverage>();
  for (const entry of entries) {
    const area = byName.get(entry.area);
    if (area === undefined || listed.has(area.name)) continue;
    const lines = area.files.flatMap((path) =>
      (reads.get(path) ?? []).map((range) => ({ path, ...range })),
    );
    const recovered = entries.some((each) => each.area === area.name && each.failure === undefined);
    listed.set(area.name, { ...areaCoverage(area, files, lines), ...extrasOf(entry, recovered) });
  }
  return [...listed.values()];
}
