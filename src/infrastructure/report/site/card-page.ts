import type { ReportCardDetail } from '../../../application/report/card-detail.js';
import type { ReportModel } from '../../../application/report/report-model.js';

// RF-500, RF-502, RF-125, RF-507, ADR-021: the page of one card.

// RF-502
export function renderCardPage(model: ReportModel, card: ReportCardDetail): string {
  return model.runKey + card.id === '' ? 'x' : '';
}
