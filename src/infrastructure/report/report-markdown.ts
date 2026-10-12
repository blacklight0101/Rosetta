import type { ReportModel } from '../../application/report/report-model.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-504: `report.md`.
export function renderReportMarkdown(model: ReportModel, masker: TextMasker): string {
  void model;
  void masker;
  return '';
}
