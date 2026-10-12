import type { CostReport } from '../../application/budget/cost-report.js';
import type { CostReportWriter } from '../../application/ports/cost-report-writer.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { formatUsd, microUsd } from '../../domain/budget/money.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-426, data-model.md section 3.12: `cost.json` (the report, two-space JSON) and `cost.md` (the
// readable tables) in the run folder. Both texts are masked like every file Rosetta writes
// (RNF-003) and made before anything is written.

export interface FileCostReportWriterOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

interface Line {
  readonly label: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: number;
}

const tokens = (count: number): string => count.toLocaleString('en-US');

function table(heading: string, keyName: string, lines: readonly Line[]): string {
  const rows = lines.map((line) =>
    [
      line.label,
      String(line.calls),
      tokens(line.inputTokens),
      tokens(line.outputTokens),
      tokens(line.cachedInputTokens),
      formatUsd(microUsd(BigInt(line.costMicros))),
    ].join(' | '),
  );
  return [
    `## ${heading}`,
    '',
    `| ${keyName} | Calls | Input tokens | Output tokens | Cached input tokens | Cost |`,
    '|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row} |`),
    '',
  ].join('\n');
}

/** The readable report (RF-426). */
// RF-426
function renderCostMarkdown(report: CostReport): string {
  const { totals } = report;
  const unpriced =
    totals.unpricedCalls === 0
      ? []
      : [`Calls of unpriced models (cost unknown): ${String(totals.unpricedCalls)}`, ''];
  return [
    `# Cost of run ${report.runId}`,
    '',
    `Price table: ${report.priceTableVersion === '' ? 'none' : report.priceTableVersion} (${report.currency})`,
    '',
    ...unpriced,
    table('Totals', 'Run', [{ label: report.runId, ...totals }]),
    table(
      'By role',
      'Role',
      report.byRole.map((line) => ({ label: line.role, ...line })),
    ),
    table(
      'By agent task',
      'Agent task',
      report.byAgentTask.map((line) => ({ label: line.agentTaskId, ...line })),
    ),
    table(
      'By provider',
      'Provider',
      report.byProvider.map((line) => ({ label: line.provider, ...line })),
    ),
    table(
      'By model',
      'Model',
      report.byModel.map((line) => ({ label: `${line.provider} ${line.model}`, ...line })),
    ),
  ].join('\n');
}

export class FileCostReportWriter implements CostReportWriter {
  private readonly options: FileCostReportWriterOptions;

  constructor(options: FileCostReportWriterOptions) {
    this.options = options;
  }

  // RF-426
  async write(scope: RunScope, report: CostReport): Promise<void> {
    const { writer, masker } = this.options;
    const folder = runPath(scope.projectId, scope.runKey);
    const files = [
      {
        path: `${folder}/cost.json`,
        text: masker.mask(`${JSON.stringify(report, null, 2)}\n`).text,
      },
      { path: `${folder}/cost.md`, text: masker.mask(renderCostMarkdown(report)).text },
    ];
    for (const file of files) {
      const written = await writer.writeText({ userId: scope.userId, path: file.path }, file.text);
      if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
    }
  }
}
