import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvaluationConfig } from '../../application/eval/evaluation-config.js';
import type { EvaluationSummary } from '../../application/eval/run-evaluation.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { loadPriceTable } from '../../infrastructure/budget/price-file.js';
import { readAppVersion } from '../../infrastructure/config/app-version.js';
import { loadEvaluationConfig, loadGoldenSet } from '../../infrastructure/eval/golden-set-file.js';
import { loadProjectTemplate } from '../../infrastructure/files/project-template.js';
import { GitHubSnapshotFetcher } from '../../infrastructure/github/github-snapshot-fetcher.js';
import { SnapshotStore } from '../../infrastructure/github/snapshot-store.js';
import { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../../infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../infrastructure/system/timestamp-id-generator.js';
import { composeLanguagePacks } from '../composition-root.js';
import { releaseAdapters } from '../compose-providers.js';
import { runEvaluation, type EvaluationParts } from './compose-evaluation.js';
import { EVAL_USAGE, parseEvalArgs, type EvalArgs } from './eval-args.js';

// RNF-006, RNF-012, RNF-015, ADR-008: `npm run eval`, the opt-in evaluation against real models.
// It is never run by the tests or CI (they drive `runEvaluation` with the fake provider). It reads
// the settings and the golden set under `eval/`, the server keys from the environment (`.env`), and
// fetches the golden set's pinned commit from GitHub like a project's scan. Its runs, snapshot and
// results stay in the git-ignored `eval-out/` of this repository.

const root = new URL('../../../', import.meta.url);
const folder = (name: string): string => fileURLToPath(new URL(name, root));

type Environment = Readonly<Record<string, string | undefined>>;
type Print = (line: string) => void;

function settingsOf(
  template: ProjectSettings,
  config: EvaluationConfig,
  args: EvalArgs,
): ProjectSettings {
  const roles = { ...config.roles, ...args.roles };
  const chosen = { ...template.roles };
  for (const [role, choice] of Object.entries(roles)) {
    if (role === 'reader' || role === 'verifier' || role === 'summariser') {
      chosen[role] = { ...chosen[role], ...choice };
    }
  }
  const run = { ...template.budget.run, maxCostMicros: config.runCapMicros };
  return {
    ...template,
    roles: chosen,
    budget: { ...template.budget, run },
    agents: { parallelism: config.parallelism ?? template.agents.parallelism },
  };
}

async function partsOf(
  config: EvaluationConfig,
  args: EvalArgs,
  env: Environment,
): Promise<EvaluationParts> {
  const clock = new SystemClock();
  const masker = new SecretMasker();
  const ids = new TimestampIdGenerator(clock);
  const output = { write: (text: string) => process.stderr.write(text) };
  const logger = new StdoutJsonLogger({ output, clock, masker, minLevel: 'warn' });
  const dataDir = join(folder('eval-out/'), 'data');
  const githubToken = env['GITHUB_TOKEN'];
  const promptsFolder = folder('prompts/');
  return {
    ...{ dataDir, outputDir: folder('eval-out/'), clock, masker, ids, logger, promptsFolder },
    settings: settingsOf(await loadProjectTemplate(folder('templates/')), config, args),
    fetcher: new GitHubSnapshotFetcher({ dataDir, clock, logger, idGenerator: ids, githubToken }),
    snapshotRoot: (key) => new SnapshotStore(dataDir).filesDir(key),
    adapters: await releaseAdapters(logger),
    serverKeys: { openai: env['OPENAI_API_KEY'], anthropic: env['ANTHROPIC_API_KEY'] },
    ollamaUrl: env['ROSETTA_OLLAMA_URL'],
    priceTable: await loadPriceTable(folder('prices/default-prices.yaml')),
    totalCapMicros: config.totalCapMicros,
    rosettaVersion: await readAppVersion(),
    packs: await composeLanguagePacks(),
  };
}

function report(summary: EvaluationSummary, print: Print): void {
  const { results } = summary.files;
  const { precision, recall, citationValidity, estimate } = results.targets;
  const mean = (value: number | null) => (value === null ? 'n/a' : value.toFixed(3));
  print(`Evaluation written to ${summary.folder}`);
  print(
    `Precision of Supported claims: ${mean(precision.mean)} (target ${String(precision.target)})`,
  );
  print(`Recall of golden rules: ${mean(recall.mean)} (target ${String(recall.target)})`);
  print(`Citation validity: ${mean(citationValidity.mean)} (target 1)`);
  print(
    `Estimate within 30%: ${String(estimate.within)} of ${String(estimate.measured)} measured runs`,
  );
}

// RNF-006, RNF-015
export async function runEvalCommand(
  args: readonly string[],
  env: Environment,
  print: Print,
): Promise<number> {
  const parsed = parseEvalArgs(args);
  if (!parsed.ok || parsed.value.help) {
    print(parsed.ok ? EVAL_USAGE : `${parsed.error}\n${EVAL_USAGE}`);
    return parsed.ok ? 0 : 2;
  }
  const evalFolder = folder('eval/');
  const config = await loadEvaluationConfig(evalFolder, parsed.value.config);
  if (!config.ok) return (print(config.error), 1);
  const golden = await loadGoldenSet(evalFolder, config.value.goldenSet);
  if (!golden.ok) return (print(golden.error), 1);
  const parts = await partsOf(config.value, parsed.value, env);
  const repetitions = parsed.value.repetitions ?? config.value.repetitions;
  const result = await runEvaluation(parts, golden.value, repetitions);
  if (!result.ok) return (print(`${result.error.code}: ${result.error.message}`), 1);
  report(result.value, print);
  return 0;
}
