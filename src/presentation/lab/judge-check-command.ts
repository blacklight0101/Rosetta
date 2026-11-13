import { join } from 'node:path';
import { limitItems } from '../../application/lab/judge/judge-check-set.js';
import { reportOf, scoreItems, type CheckReport } from '../../application/lab/judge/judge-check.js';
import { FileSpendLedger } from '../../infrastructure/lab/file-spend-ledger.js';
import {
  loadCheckItems,
  writeJudgeCheck,
  type CheckFolders,
} from '../../infrastructure/lab/judge-check-files.js';
import { loadJudgePrompt } from '../../infrastructure/lab/rubric-files.js';
import { dollars } from '../eval/eval-settings.js';
import { composeJudge } from './compose-judge.js';
import { guardedOf, type LabParts } from './compose-lab.js';
import type { LabArgs } from './lab-args.js';
import { holdLifetimeProblem, modelIsFree, sharedLedgerProblem } from './lab-ledger-path.js';

// RF-1408, RF-1402, ADR-029: `npm run lab -- --judge-check <provider:model> [--yes]`. The judge scores
// the sampled calibration claims and the hand-scored samples; every call goes through the lab's
// ledger gate like any other. Without `--yes` it only says how many calls it would make.

type CheckArgs = Extract<LabArgs, { kind: 'judge-check' }>;
type Print = (line: string) => void;

const pct = (part: number, whole: number): string =>
  whole === 0 ? 'n/a' : `${((part / whole) * 100).toFixed(0)}%`;

/** The lines of the report: the figures the owner reads. */
function reportLines(report: CheckReport, folder: string): string[] {
  const { calibration } = report;
  const lines = [
    `Judge check written to ${folder}`,
    `Calibration claims: ${String(calibration.agreed)} of ${String(calibration.items)} agree with the hand label (${pct(calibration.agreed, calibration.items)}); ${String(calibration.scored)} scored`,
  ];
  for (const [family, agreement] of Object.entries(report.families)) {
    lines.push(
      `${family}: ${String(agreement.scored)} of ${String(agreement.samples)} samples scored; overall in the same band as the hand score for ${String(agreement.overallAgreed)}`,
    );
    for (const [id, each] of Object.entries(agreement.criteria)) {
      lines.push(
        `  ${id}: exact ${pct(each.exact, each.n)}, within one point ${pct(each.within1, each.n)}, mean difference ${each.meanAbsDiff.toFixed(2)} (n ${String(each.n)})`,
      );
    }
  }
  lines.push(
    `Judge calls: ${String(report.calls)}; cost: $${(report.costMicros / 1e6).toFixed(4)}`,
  );
  return report.stopped === null ? lines : [...lines, `Stopped: ${report.stopped}`];
}

function startProblem(parts: LabParts, args: CheckArgs): string | undefined {
  const { provider } = args.model;
  const settings = parts.settings.providers[provider];
  return (
    sharedLedgerProblem(settings?.kind, parts.ledgerFile) ??
    holdLifetimeProblem(
      provider,
      settings,
      modelIsFree(parts.priceTable, provider, args.model.model),
    )
  );
}

// RF-1408
export async function runJudgeCheck(
  parts: LabParts,
  args: CheckArgs,
  folders: CheckFolders,
  print: Print,
): Promise<number> {
  const loaded = await loadCheckItems(folders);
  if (!loaded.ok) return (print(loaded.error), 1);
  const prompt = await loadJudgePrompt(folders.promptsFolder);
  if (!prompt.ok) return (print(prompt.error), 1);
  const problem = startProblem(parts, args);
  if (problem !== undefined) return (print(problem), 1);
  const { rubrics } = loaded.value;
  const items = limitItems(loaded.value.items, args.limit);
  const { provider, model } = args.model;
  const { limits } = parts;
  print(
    `npm run lab -- --judge-check sends ${String(items.length)} judge calls to ${provider}:${model} (the calibration claims and the hand-scored samples), one per item.`,
  );
  print(
    `This invocation may cost up to ${dollars(limits.invocationCapMicros)}; the phase has a stop line at ${dollars(limits.stopMicros)} and a cap of ${dollars(limits.totalCapMicros)}.`,
  );
  if (!args.yes) return (print('Nothing was sent. Run again with --yes to start.'), 1);
  const guarded = await guardedOf(parts);
  const { clock, ids } = parts;
  const ledger = new FileSpendLedger({
    ...{ file: parts.ledgerFile ?? join(parts.outputDir, 'ledger.jsonl'), limits },
    ...{ invocation: ids.uuid(), clock, ids },
  });
  const judge = await composeJudge(parts, guarded, ledger, {
    model: args.model,
    prompt: prompt.value,
    rubrics,
  });
  if (!judge.ok) return (print(`${judge.error.code}: ${judge.error.message}`), 1);
  const checked = await scoreItems(judge.value, items);
  const report = reportOf(checked, rubrics);
  const id = ids.runId('judge-check');
  const folder = await writeJudgeCheck(
    { outputDir: parts.outputDir, id, masker: parts.masker },
    report,
  );
  for (const line of reportLines(report, folder)) print(line);
  return report.stopped === null ? 0 : 1;
}
