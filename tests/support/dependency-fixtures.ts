import type {
  RenderLimits,
  RenderedProject,
} from '../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { renderProject } from '../../src/infrastructure/sources/workbook/workbook-renderer.js';
import type {
  WorkbookCell,
  WorkbookModel,
} from '../../src/infrastructure/sources/workbook/workbook-model.js';
import { book, cell, num, sheet, text } from './rendered-workbook-fixtures.js';

// P3-47: small workbooks built in the test (first-party data only) and the text of the map.

const formula = (value: string): Pick<WorkbookCell, 'formula'> => ({
  formula: { kind: 'normal', text: value },
});

export const withFormula = (address: string, value: string): WorkbookCell =>
  cell(address, num(0), formula(value));

export function projectOf(
  models: readonly WorkbookModel[],
  limits?: Partial<RenderLimits>,
): RenderedProject {
  return renderProject(models, { maxTotalBytes: 256 * 1024 * 1024, ...limits });
}

export function dependenciesOf(
  models: readonly WorkbookModel[],
  limits?: Partial<RenderLimits>,
): string {
  return projectOf(models, limits).dependencies.content;
}

/** The non-empty lines between a `## heading` and the next heading. */
export function sectionOf(content: string, heading: string): string[] {
  const lines = content.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).filter((line) => line !== '');
}

/** Two workbooks: Pricing.xlsx reads Rates.xlsx, a name, a missing workbook and two dynamic cells. */
export function pricingProject(): WorkbookModel[] {
  const summary = sheet('Summary', {
    cells: [
      cell('A2', text('North')),
      cell('B2', num(4)),
      cell('C2', num(1250)),
      cell('B3', num(2)),
      cell('C3', num(900)),
      withFormula('D2', "B2*C2*'Rates 2026'!$C$4"),
      withFormula('D3', "B3*C3*'Rates 2026'!$C$4"),
      withFormula('E2', 'SUM(D2:D3)'),
      withFormula('F2', '[1]Rates!C4*2'),
      withFormula('G2', '[2]Gone!A1+1'),
      withFormula('H2', 'INDIRECT("B"&ROW())'),
      withFormula('H3', 'OFFSET(A1,1,1)'),
      withFormula('I2', 'TaxRate*B2'),
    ],
  });
  const rates = sheet('Rates 2026', { cells: [cell('C4', num(0.21)), cell('C5', num(0.1))] });
  const pricing = book([summary, rates], {
    fileName: 'Pricing.xlsx',
    definedNames: [{ name: 'TaxRate', hidden: false, refersTo: "'Rates 2026'!$C$4" }],
    externalLinks: [{ fileName: 'rates.xlsx' }, { fileName: 'C:\\Users\\x\\Missing.xlsx' }],
  });
  const external = book([sheet('Rates', { cells: [cell('C4', num(7))] })], {
    fileName: 'Rates.xlsx',
  });
  return [pricing, external];
}

/** One sheet `Chain` of `length` formulas, each reading the next; the last reads `last`. */
export function chainProject(length: number, last: string): WorkbookModel[] {
  const cells = Array.from({ length }, (_, i) =>
    withFormula(`A${String(i + 1)}`, i === length - 1 ? last : `A${String(i + 2)}+1`),
  );
  return [book([sheet('Chain', { cells })], { fileName: 'Chain.xlsx' })];
}
