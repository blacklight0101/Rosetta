import type { PlanningBrief } from './planning-brief.js';

// RF-648, RF-649, RF-650, DEC-150, DEC-178: placeholder so the red tests compile (DEC-191).

export const workbookQuestionIds = [
  'workbook.signIn',
  'workbook.secrets',
  'workbook.screens',
] as const;
export type WorkbookQuestionId = (typeof workbookQuestionIds)[number];

export interface WorkbookOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
}

export interface WorkbookAnswer {
  readonly option: string;
  readonly words: string;
  readonly defaulted: boolean;
}

export interface WorkbookSetup {
  readonly signIn: WorkbookAnswer;
  readonly secrets: WorkbookAnswer;
  readonly screens: WorkbookAnswer;
}

export function workbookOptions(question: WorkbookQuestionId, hosting: string): WorkbookOption[] {
  return question === hosting ? [] : [];
}

export function workbookSetup(brief: PlanningBrief): WorkbookSetup {
  const none = { option: brief.chosen?.['workbook.signIn'] ?? '', words: '', defaulted: true };
  return { signIn: none, secrets: none, screens: none };
}
