import type { Catalogue, PlanOptions } from '../../api/plan-schemas.js';

// RF-645, DEC-178: the options of every Plan setup question (stub; filled in by the next commit).

export interface QuestionOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
  /** For a project-context question: the text the option puts in the field. */
  readonly value?: string;
}

export const OWN_ANSWER = 'Type your own answer';
export const OPTION_QUESTIONS: readonly string[] = [];

export function optionTitle(option: QuestionOption): string {
  return option.title;
}

export function questionOptions(
  id: string,
  from: { readonly catalogue: Catalogue; readonly options: PlanOptions | undefined },
): QuestionOption[] {
  return id === '' || from.catalogue.entries.length < 0 ? [] : [];
}
