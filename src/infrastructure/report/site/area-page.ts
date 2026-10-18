import type { ReportModel } from '../../../application/report/report-model.js';

// RF-500, RF-507, ADR-021: the page of one area.

// RF-500
export function renderAreaPage(model: ReportModel, area: string): string {
  return model.runKey + area === '' ? 'x' : '';
}
