import type { ReportModel } from '../../../application/report/report-model.js';
import { renderAreaPage } from './area-page.js';
import { renderCardPage } from './card-page.js';
import { areaPageName, cardPageName } from './page-names.js';

// RF-500, RF-502: the pages of the areas and the cards of a run, by file name.

const byCodeUnit = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Every area the report knows: those of the code map, of the coverage and of the cards. */
function areaNames(model: ReportModel): string[] {
  const names = new Set<string>([
    ...model.areas.map((area) => area.name),
    ...(model.coverage?.areas.map((area) => area.area) ?? []),
    ...model.cards.map((card) => card.area),
    ...model.cardDetails.map((card) => card.area),
  ]);
  return [...names].sort(byCodeUnit);
}

/** A page for each area and for each card that has a detail; the names are in code unit order. */
// RF-500
export function renderEvidencePages(model: ReportModel): Readonly<Record<string, string>> {
  const pages: Record<string, string> = {};
  for (const area of areaNames(model)) pages[areaPageName(area)] = renderAreaPage(model, area);
  for (const card of model.cardDetails) pages[cardPageName(card.id)] = renderCardPage(model, card);
  return Object.fromEntries(Object.entries(pages).sort(([a], [b]) => byCodeUnit(a, b)));
}
