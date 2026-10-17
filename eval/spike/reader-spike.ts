import { runAgentTask } from '../../src/application/agent/agent-loop.js';
import { ReadOnlyTools } from '../../src/application/agent/read-only-tools.js';
import type { ReaderPrompts } from '../../src/application/agent/reader-prompts.js';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { ProviderSetFactory } from '../../src/application/ports/provider-set-factory.js';
import type { RepositoryReader } from '../../src/application/ports/repository-reader.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import {
  readerTaskSettings,
  readerToolLimits,
} from '../../src/application/understand/reader-settings.js';
import type { Area } from '../../src/domain/code-map/area.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import { scoreRun, type ReaderScore } from './reader-score.js';
import { readerRequest } from './spike-providers.js';

// Q-04, P1-47: one reader task over one demo area for each candidate model, through the guarded
// provider of the reader role. The task, its prompts, its tools and its limits are the ones an
// understand run uses (RF-201); only the model changes between the runs. A model that fails, loops
// or answers badly is a row of the table, never an exception.

export interface DemoArea {
  readonly reader: RepositoryReader;
  readonly codeMap: CodeMap;
  readonly area: Area;
}

export interface ReaderSpikeDeps {
  readonly factory: ProviderSetFactory;
  /** The project settings (the shipped template); only the reader's model changes per run. */
  readonly settings: ProjectSettings;
  readonly demo: DemoArea;
  readonly prompts: ReaderPrompts;
  readonly logger: Logger;
  readonly ids: Pick<IdGenerator, 'dataBlockTag' | 'uuid'>;
  /** A monotonic clock in milliseconds. */
  readonly now: () => number;
  /** Cancels the whole spike. */
  readonly signal: AbortSignal;
}

function settingsFor(settings: ProjectSettings, model: string): ProjectSettings {
  return { ...settings, roles: { ...settings.roles, reader: { ...settings.roles.reader, model } } };
}

async function scoreModel(deps: ReaderSpikeDeps, model: string): Promise<ReaderScore> {
  const { demo, now } = deps;
  const settings = settingsFor(deps.settings, model);
  const built = await deps.factory.build(readerRequest(settings, deps.ids.uuid()));
  const role = built.ok ? built.value.get('reader') : undefined;
  if (!built.ok || role === undefined) {
    const code = built.ok ? 'no reader' : (built.error[0]?.code ?? 'no reader');
    return scoreRun(
      model,
      {
        state: 'Failed',
        reason: 'provider-failed',
        code,
        drafts: [],
        problems: [],
        turns: 0,
        toolErrors: 0,
      },
      demo.codeMap,
      0,
    );
  }
  let calls = 0;
  const started = now();
  const result = await runAgentTask({
    provider: role.provider,
    tools: new ReadOnlyTools({
      ...{ reader: demo.reader, codeMap: demo.codeMap, area: demo.area, logger: deps.logger },
      limits: readerToolLimits(settings),
      ids: deps.ids,
    }),
    prompts: deps.prompts,
    logger: deps.logger,
    settings: readerTaskSettings(settings, role),
    context: {
      runId: 'spike',
      agentTaskId: `reader-${demo.area.name}`,
      role: 'reader',
      traceId: 'a'.repeat(32),
      parentSpanId: 'b'.repeat(16),
    },
    nextCallId: () => {
      calls += 1;
      return `spike#${String(calls)}`;
    },
    signal: deps.signal,
  });
  return scoreRun(model, result, demo.codeMap, (now() - started) / 1000);
}

/** The score of every model, one after another (one GPU), in the order given. */
export async function runReaderSpike(
  deps: ReaderSpikeDeps,
  models: readonly string[],
): Promise<ReaderScore[]> {
  const scores: ReaderScore[] = [];
  for (const model of models) scores.push(await scoreModel(deps, model));
  return scores;
}
