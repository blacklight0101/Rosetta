// RF-1409, DEC-231: which cases of a set a lab run sends. `--split tune|held-back` keeps one side;
// `--sample n` keeps the first n cases by id (plain code-unit order, so a sample never depends on the
// order of the set), taken after the split. A smaller sample is therefore the start of a larger one
// (a quarter is inside a half), and a count above the cases left takes them all. Without sample the
// cases keep the order of the set.

export type LabSplit = 'tune' | 'held-back';

export interface LabSelection {
  readonly split: LabSplit | 'all';
  readonly sample: number | null;
}

/** The selection of a run that asked for nothing, and of a results file that records none. */
export const ALL_CASES: LabSelection = { split: 'all', sample: null };

const byId = (a: { readonly id: string }, b: { readonly id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function selectCases<T extends { readonly id: string; readonly split: LabSplit }>(
  cases: readonly T[],
  selection: LabSelection,
): T[] {
  const side = cases.filter((each) => selection.split === 'all' || each.split === selection.split);
  return selection.sample === null ? side : [...side].sort(byId).slice(0, selection.sample);
}

export function sameSelection(a: LabSelection | undefined, b: LabSelection | undefined): boolean {
  const [first, second] = [a ?? ALL_CASES, b ?? ALL_CASES];
  return first.split === second.split && first.sample === second.sample;
}

export function describeSelection(selection: LabSelection): string {
  const parts = [
    ...(selection.split === 'all' ? [] : [`split ${selection.split}`]),
    ...(selection.sample === null ? [] : [`sample ${String(selection.sample)}`]),
  ];
  return parts.length === 0 ? 'every case' : parts.join(', ');
}
