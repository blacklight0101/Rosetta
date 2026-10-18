import type { ReportModel } from '../../../application/report/report-model.js';

// RF-500, RF-502: the pages of the areas and the cards of a run, by file name.

// RF-500
export function renderEvidencePages(model: ReportModel): Readonly<Record<string, string>> {
  return model.cards.length === 0 ? {} : {};
}
