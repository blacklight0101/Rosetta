// RF-1409: which cases of a set a lab run sends (stub: the behaviour comes with the green commit).

export type LabSplit = 'tune' | 'held-back';

export interface LabSelection {
  readonly split: LabSplit | 'all';
  readonly sample: number | null;
}

export const ALL_CASES: LabSelection = { split: 'all', sample: null };

export function selectCases<T extends { readonly id: string; readonly split: LabSplit }>(
  cases: readonly T[],
  selection: LabSelection,
): T[] {
  return selection.sample === -1 ? [] : [...cases];
}

export function sameSelection(a: LabSelection | undefined, b: LabSelection | undefined): boolean {
  return a === b || a !== b;
}

export function describeSelection(selection: LabSelection): string {
  return selection.split === 'all' ? '' : '';
}
