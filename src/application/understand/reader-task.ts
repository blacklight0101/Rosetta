import {
  recordManifestAgentTask,
  recordManifestContext,
  recordManifestModelVersion,
} from '../../domain/runs/run-manifest.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import type { Area } from '../../domain/code-map/area.js';
import { runAgentTask } from '../agent/agent-loop.js';
import type { AgentTaskResult } from '../agent/agent-task-result.js';
import { ReadOnlyTools } from '../agent/read-only-tools.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import type { ReaderTask } from './reader-tasks.js';
import { toolsWithReads, type TaskReads } from './run-coverage.js';
import { readerTaskSettings, readerToolLimits } from './reader-settings.js';
import {
  providerWithEvents,
  toolsWithEvents,
  TurnCounter,
  type TaskEvents,
} from './task-events.js';

// RF-200, RF-201, architecture section 5 (`AgentTaskState`): one reader task of an understand run,
// from `Running` to its end. The task reads its area through the read-only tools over the scanned
// snapshot and asks the guarded provider of the reader role; every turn and tool call is a run
// event. The manifest lists the task with its state, turns and cards (data-model.md section 3.6).

/** What every reader task of one run shares. */
export interface ReaderTaskContext {
  readonly execution: RunExecution;
  readonly scanned: ScannedSource;
  readonly role: RoleProvider;
  readonly prompts: ReaderPrompts;
  readonly settings: ProjectSettings;
  readonly updates: ManifestUpdates;
  readonly logger: Logger;
  /** `<runKey>#<n>`, one numbering for every task of the run. */
  readonly nextCallId: () => string;
  /** One per run, 32 hexadecimal characters. */
  readonly traceId: string;
  /** RF-145: the random tag of every data block the tools write. */
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

const READER = 'reader';

/**
 * RF-208: how a retry differs from the first run of a task. It is a fresh conversation, so its
 * transcript and calls are kept under their own id; it may read only part of the area; and its
 * turns may be cut so a split retry stays within one turn limit.
 */
export interface TaskAttempt {
  /** The id its transcript and provider calls carry, a plain file name (data-model 3.15). */
  readonly callTaskId: string;
  readonly area: Area;
  readonly maxTurns?: number;
}

/** The task's span id: the run's trace prefix and the task's number, 16 hexadecimal characters. */
function spanIdOf(traceId: string, task: ReaderTask): string {
  const number = Number.parseInt(task.agentTaskId.replace(/\D/gu, ''), 10);
  const suffix = (Number.isFinite(number) ? number : 0).toString(16).padStart(3, '0').slice(-3);
  return `${traceId.slice(0, 13)}${suffix}`;
}

/** Records the task's state in the manifest's `agentTasks` (RF-200). */
export function recordTaskState(
  context: Pick<ReaderTaskContext, 'updates'>,
  task: ReaderTask,
  progress: { readonly state: AgentTaskState; readonly turns: number; readonly cards: number },
): Promise<void> {
  const { agentTaskId, area } = task;
  return context.updates.update((manifest) =>
    recordManifestAgentTask(manifest, { agentTaskId, area: area.name, role: READER, ...progress }),
  );
}

/** Records the model version and, for Ollama, the context size of one answer (RNF-004, RF-401). */
async function recordAnswer(updates: ManifestUpdates, response: LlmResponse): Promise<void> {
  const { modelVersion, metrics } = response;
  await updates.update((manifest) => recordManifestModelVersion(manifest, READER, modelVersion));
  const ollama = metrics?.ollama;
  if (ollama?.contextTokens === undefined || ollama.contextSource === undefined) return;
  const context = { contextTokens: ollama.contextTokens, contextSource: ollama.contextSource };
  await updates.update((manifest) => recordManifestContext(manifest, READER, context));
}

// RF-201, RF-1002, RF-230: the lines the tools return are kept in `reads` for the coverage.
export async function runReaderTask(
  context: ReaderTaskContext,
  task: ReaderTask,
  reads: TaskReads,
  attempt?: TaskAttempt,
): Promise<AgentTaskResult> {
  const { execution, scanned, role, updates, logger } = context;
  const { agentTaskId } = task;
  const area = attempt?.area ?? task.area;
  await recordTaskState(context, task, { state: 'Running', turns: 0, cards: 0 });
  await execution.events.emit(
    'agent.started',
    { area: task.area.name, role: READER, model: role.model },
    agentTaskId,
  );
  const events: TaskEvents = {
    events: execution.events,
    agentTaskId,
    onAnswer: (response) => recordAnswer(updates, response),
  };
  const turns = new TurnCounter();
  const tools = new ReadOnlyTools({
    ...{ reader: scanned.reader, codeMap: scanned.codeMap, area, logger },
    limits: readerToolLimits(context.settings),
    ids: context.ids,
  });
  return runAgentTask({
    provider: providerWithEvents(role.provider, events, turns),
    tools: toolsWithEvents(toolsWithReads(tools, reads), events, turns),
    prompts: context.prompts,
    logger,
    settings: {
      ...readerTaskSettings(context.settings, role),
      ...(attempt?.maxTurns === undefined ? {} : { maxTurns: attempt.maxTurns }),
    },
    context: {
      runId: execution.run.runKey,
      agentTaskId: attempt?.callTaskId ?? agentTaskId,
      role: READER,
      traceId: context.traceId,
      parentSpanId: spanIdOf(context.traceId, task),
    },
    nextCallId: context.nextCallId,
    signal: execution.signal,
    ...(task.answers === undefined ? {} : { answers: task.answers }),
  });
}
