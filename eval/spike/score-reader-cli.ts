import { resolve } from 'node:path';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { Logger } from '../../src/application/ports/logger.js';
import { loadProjectTemplate } from '../../src/infrastructure/files/project-template.js';
import { loadPriceTable } from '../../src/infrastructure/budget/price-file.js';
import { loadReaderPrompts } from '../../src/infrastructure/prompts/prompt-files.js';
import { realAdapters } from '../../src/infrastructure/providers/adapter-builder.js';
import type { AdapterBuilder } from '../../src/infrastructure/providers/adapter-spec.js';
import { loadTextToolProtocol } from '../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { SystemClock } from '../../src/infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../src/infrastructure/system/timestamp-id-generator.js';
import { loadDemoArea } from './demo-area.js';
import { pullCommands, probeOllama, type Fetch } from './ollama-probe.js';
import { renderTable } from './reader-score.js';
import { runReaderSpike } from './reader-spike.js';
import { spikeFactory } from './spike-providers.js';

// Q-04, Q-10, RNF-011, P1-47: `npm run spike:reader [-- --models a,b --repo <folder> --area <name>]`.
// Runs the reader on one demo area with each candidate model through Ollama and prints the results
// table for docs/providers.md. It never downloads a model: a server that is not running or a model
// that is not pulled ends it with the command the owner must run. It is an opted-in evaluation
// outside the automated tests (ADR-008): under ROSETTA_TEST=1 it refuses to call a real Ollama.

/** At most four models that fit 8 GB of VRAM and call tools (P1-47); the owner may replace them. */
export const candidateModels: readonly string[] = [
  'gemma4:e4b',
  'qwen3:8b',
  'llama3.1:8b',
  'qwen2.5-coder:7b',
];
const maxCandidates = 4;
const defaultUrl = 'http://127.0.0.1:11434';
const toolRoot = resolve(import.meta.dirname, '..', '..');

export const exitCodes = { ok: 0, usage: 2, unavailable: 3 } as const;

export interface SpikeIo {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch: Fetch;
  readonly write: (line: string) => void;
  /** The adapters; the real ones unless a test hands the fake. */
  readonly adapters?: AdapterBuilder;
  readonly now: () => number;
}

interface Options {
  readonly models: readonly string[];
  readonly repo: string;
  readonly area: string;
  /** The reader's turn limit; the template's when not given. */
  readonly maxTurns: number | undefined;
}

function maxTurnsOf(text: string | undefined): number | undefined {
  const turns = Number(text);
  return text !== undefined && Number.isInteger(turns) && turns >= 1 && turns <= 50
    ? turns
    : undefined;
}

const usage =
  'Usage: npm run spike:reader -- [--models a,b,c] [--repo <folder>] [--area <name>] [--max-turns <n>]';
const flags = ['--models', '--repo', '--area', '--max-turns'];

/** The flags and their values, or undefined when an argument is not a flag with a value. */
function flagValues(argv: readonly string[]): Map<string, string> | undefined {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === undefined || value === undefined || !flags.includes(name)) return undefined;
    values.set(name, value);
  }
  return values;
}

function parseArgs(argv: readonly string[]): Options | string {
  const values = flagValues(argv);
  if (values === undefined) return usage;
  const named = values.get('--models')?.split(',');
  const models = named?.filter((name) => name !== '') ?? candidateModels;
  if (models.length === 0 || models.length > maxCandidates) {
    return `Give between 1 and ${String(maxCandidates)} models (P1-47).`;
  }
  const demoRepo = resolve(toolRoot, 'tests/fixtures/repos/webforms-csharp');
  return {
    models,
    repo: resolve(values.get('--repo') ?? demoRepo),
    area: values.get('--area') ?? 'Services',
    maxTurns: maxTurnsOf(values.get('--max-turns')),
  };
}

/** The spike does not keep the reader's log: the score of each run is what it reports. */
const quietLogger: Logger = {
  log: () => Promise.resolve(),
  securityEvent: () => Promise.resolve(),
};

async function adaptersFor(io: SpikeIo): Promise<AdapterBuilder> {
  if (io.adapters !== undefined) return io.adapters;
  return realAdapters({
    testMode: false,
    textProtocolPrompt: (await loadTextToolProtocol(resolve(toolRoot, 'prompts'))).text,
    logger: quietLogger,
  });
}

function withTurns(settings: ProjectSettings, maxTurns: number | undefined): ProjectSettings {
  if (maxTurns === undefined) return settings;
  return {
    ...settings,
    roles: { ...settings.roles, reader: { ...settings.roles.reader, maxTurns } },
  };
}

function refusal(io: SpikeIo, lines: readonly string[]): number {
  for (const line of lines) io.write(line);
  return exitCodes.unavailable;
}

// Q-04
export async function runScoreReader(io: SpikeIo): Promise<number> {
  const options = parseArgs(io.argv);
  if (typeof options === 'string') {
    io.write(options);
    return exitCodes.usage;
  }
  if (io.env['ROSETTA_TEST'] === '1' && io.adapters === undefined) {
    io.write('ROSETTA_TEST=1 is set: the spike calls a real Ollama, so unset it first.');
    return exitCodes.usage;
  }
  const probe = await probeOllama(io.env['ROSETTA_OLLAMA_URL'] ?? defaultUrl, io.fetch);
  if (!probe.ok) return refusal(io, [probe.message, 'Nothing was run and nothing was downloaded.']);
  const missing = pullCommands(options.models, probe.pulled);
  if (missing.length > 0) {
    return refusal(io, ['These models are not pulled in Ollama. Run:', ...missing]);
  }
  const template = await loadProjectTemplate(resolve(toolRoot, 'templates'));
  const settings = withTurns(template, options.maxTurns);
  const demo = await loadDemoArea(options.repo, options.area, settings, quietLogger);
  if (typeof demo === 'string') {
    io.write(demo);
    return exitCodes.usage;
  }
  const clock = new SystemClock();
  const ids = new TimestampIdGenerator(clock);
  const factory = spikeFactory({
    adapters: await adaptersFor(io),
    ollamaUrl: probe.baseUrl,
    priceTable: await loadPriceTable(resolve(toolRoot, 'prices/default-prices.yaml')),
    ...{ clock, ids, logger: quietLogger },
  });
  const scores = await runReaderSpike(
    {
      ...{ factory, settings, demo, ids, now: io.now, logger: quietLogger },
      prompts: await loadReaderPrompts(resolve(toolRoot, 'prompts')),
      signal: new AbortController().signal,
    },
    options.models,
  );
  io.write(
    renderTable(scores, {
      date: clock.now().toISOString().slice(0, 10),
      repo: options.repo,
      area: options.area,
    }),
  );
  return exitCodes.ok;
}
