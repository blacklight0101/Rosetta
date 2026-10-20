// RF-153, RF-151: the bounds of the dependency map. A workbook is untrusted: a few hundred bytes of
// formula can name a range of 17 billion cells, and two million formulas can each name thousands of
// ranges. Ranges are kept as ranges, never expanded; everything else the map keeps is counted against
// one of these limits, and a limit that is reached is written in `dependencies.md`, never silent.

export interface DependencyLimits {
  /** The references (a sheet and a range of cells) kept for all formulas of one render. */
  readonly maxReferences: number;
  /** The distinct sheet-to-sheet edges listed. */
  readonly maxSheetEdges: number;
  /** The distinct unresolved references (a sheet and a missing name) listed. */
  readonly maxUnresolved: number;
  /** The cells of formulas with an unresolved reference that are located, all targets together. */
  readonly maxUnresolvedCells: number;
  /** The steps of the circular-reference search (an edge followed, a column of cells jumped). */
  readonly maxCycleWork: number;
  /** The circular references written out; the rest are counted. */
  readonly maxCyclesListed: number;
}

export const DEFAULT_DEPENDENCY_LIMITS: DependencyLimits = {
  maxReferences: 8_000_000,
  maxSheetEdges: 100_000,
  maxUnresolved: 10_000,
  maxUnresolvedCells: 100_000,
  maxCycleWork: 20_000_000,
  maxCyclesListed: 10_000,
};
