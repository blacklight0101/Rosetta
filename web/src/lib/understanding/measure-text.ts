import type { MeasureFigures } from '../../api/understanding.js';

// RF-231: stub.

/** The measures of a run or of one side of a Deepen: the files not read are only counted here. */
export type MeasureSet = Omit<MeasureFigures, 'filesNotRead'>;

export interface MeasureRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface Standing {
  readonly wellCovered: boolean;
  readonly text: string;
}

export function standingOf(measures: MeasureSet): Standing {
  return { wellCovered: measures.supported < 0, text: '' };
}

export function measureRows(measures: MeasureSet): readonly MeasureRow[] {
  return measures.supported < 0 ? [{ id: '', label: '', value: '', detail: '' }] : [];
}
