import {
  recordManifestAgentTask,
  recordManifestModelVersion,
} from '../../domain/runs/run-manifest.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import { runAgentTask } from '../agent/agent-loop.js';
import type { AgentTaskResult } from '../agent/agent-task-result.js';
import { ReadOnlyTools } from '../agent/read-only-tools.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';
import type { Logger } from '../ports/logger.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import type { ReaderTask } from './reader-tasks.js';
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
}

const READER = 'reader';

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

// RF-201, RF-1002
export async function runReaderTask(
  context: ReaderTaskContext,
  task: ReaderTask,
): Promise<AgentTaskResult> {
  const { execution, scanned, role, updates, logger } = context;
  const { agentTaskId } = task;
  await recordTaskState(context, task, { state: 'Running', turns: 0, cards: 0 });
  await execution.events.emit(
    'agent.started',
    { area: task.area.name, role: READER, model: role.model },
    agentTaskId,
  );
  const events: TaskEvents = {
    events: execution.events,
    agentTaskId,
    onModelVersion: (version) =>
      updates.update((manifest) => recordManifestModelVersion(manifest, READER, version)),
  };
  const turns = new TurnCounter();
  const tools = new ReadOnlyTools({
    ...{ reader: scanned.reader, codeMap: scanned.codeMap, area: task.area, logger },
    limits: readerToolLimits(context.settings),
  });
  return runAgentTask({
    provider: providerWithEvents(role.provider, events, turns),
    tools: toolsWithEvents(tools, events, turns),
    prompts: context.prompts,
    logger,
    settings: readerTaskSettings(context.settings, role),
    context: {
      runId: execution.run.runKey,
      agentTaskId,
      role: READER,
      traceId: context.traceId,
      parentSpanId: spanIdOf(context.traceId, task),
    },
    nextCallId: context.nextCallId,
    signal: execution.signal,
  });
}
