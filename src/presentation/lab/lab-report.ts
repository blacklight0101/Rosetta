import {
  summariseLab,
  type ComparedSide,
  type LabCaseResult,
  type LabComparison,
  type LabResults,
  type LabSummary,
} from '../../application/lab/lab-results.js';

// RF-1403, RNF-015: the lines `npm run lab` prints for a finished invocation and for `--compare`:
// the deterministic metrics, as rates and means, and the two versions side by side on each case.

const pct = (value: number | null): string =>
  value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;
const mean = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(1));
const money = (micros: number): string => `$${(micros / 1_000_000).toFixed(4)}`;

function errorsOf(summary: LabSummary): string {
  const entries = Object.entries(summary.errorsByCode);
  return entries.length === 0
    ? 'none'
    : entries.map(([code, count]) => `${code} x${String(count)}`).join(', ');
}

/** The metrics of one side, one line each, as the single report and the comparison show them. */
function metricLines(summary: LabSummary): string[] {
  return [
    `Valid on the first try: ${pct(summary.firstTryRate)}; repaired: ${pct(summary.repairedRate)}; not usable: ${pct(summary.invalidRate)}`,
    `Refused: ${String(summary.refusedCount)}; errors by RST code: ${errorsOf(summary)}`,
    `Agreement with the expected labels: ${pct(summary.agreementRate)}`,
    `Per call: ${mean(summary.meanInputTokens)} input and ${mean(summary.meanOutputTokens)} output tokens, ${mean(summary.meanLatencyMs)} ms`,
    `Calls: ${String(summary.calls)}; cost: ${money(summary.costMicros)}`,
  ];
}

// RF-1403
export function summaryLines(results: LabResults, folder: string): string[] {
  const { prompt, model, caseSet } = results;
  const summary = summariseLab(results);
  const lines = [
    `Lab results written to ${folder}`,
    `Prompt ${prompt.name} (${prompt.sha256.slice(0, 12)}) on ${model.provider}:${model.model}, case set ${caseSet.version}`,
    `${String(summary.cases)} of ${String(results.planned)} planned cases run`,
    ...metricLines(summary),
  ];
  return results.refusal === null ? lines : [...lines, `Stopped: ${results.refusal}`];
}

function mark(each: LabCaseResult | undefined): string {
  if (each === undefined) return '-';
  const how = each.refused
    ? 'refused'
    : each.validFirstTry
      ? 'first try'
      : each.repaired
        ? 'repaired'
        : 'not usable';
  const agreed = each.agreed === null ? '' : each.agreed ? ', agrees' : ', differs';
  return `${each.detail} (${how}${agreed}, ${String(each.calls)} calls)`;
}

function sideLine(side: ComparedSide, label: string): string {
  return `${label}: ${side.name} (${side.sha256.slice(0, 12)}) on ${side.model}`;
}

// RF-1403
export function compareLines(compared: LabComparison): string[] {
  const { a, b } = compared;
  return [
    sideLine(a, 'A'),
    sideLine(b, 'B'),
    'A totals:',
    ...metricLines(a.summary).map((line) => `  ${line}`),
    'B totals:',
    ...metricLines(b.summary).map((line) => `  ${line}`),
    'Case by case (A | B):',
    ...compared.cases.map(
      (each) => `  ${each.caseId} #${String(each.repetition)}: ${mark(each.a)} | ${mark(each.b)}`,
    ),
  ];
}
