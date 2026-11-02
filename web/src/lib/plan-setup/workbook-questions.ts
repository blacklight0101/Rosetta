import type { Catalogue } from '../../api/plan-schemas.js';

// RF-648, RF-649, RF-650, RF-645, DEC-150, P8-09: the three questions Plan setup asks of a project of
// Excel workbooks. The ids are the brief's keys; the labels and the options come from the wording the
// server serves with the catalogue (`wording.workbook`, one source with the package), so the page
// keeps no copy of them. The answers are the brief's `chosen` option id (or "typed") and `typed` text.

export const WORKBOOK_IDS: readonly string[] = [
  'workbook.signIn',
  'workbook.store',
  'workbook.screens',
];

export type WorkbookWording = Catalogue['wording']['workbook'];

export interface WorkbookPageOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
}

/** The options of a question, the recommended one first; the sign-in follows the hosting answer. */
export function workbookOptions(
  wording: WorkbookWording,
  question: string,
  hosting: string,
): WorkbookPageOption[] {
  const plain = wording.options[question] ?? [];
  const windows = new RegExp(wording.windowsHost, 'iu').test(hosting);
  const recommended = question === 'workbook.signIn' ? (windows ? 'windows' : 'sso') : plain[0]?.id;
  const all = plain.map((option) => ({ ...option, recommended: option.id === recommended }));
  return [...all.filter((o) => o.recommended), ...all.filter((o) => !o.recommended)];
}
