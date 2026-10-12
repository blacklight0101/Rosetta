import type { AgentTaskRequest } from '../agent/agent-loop.js';
import type { ToolLimits } from '../agent/tool-limits.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import type { RoleProvider } from '../providers/provider-set.js';

// RF-201, RF-144, DEC-117: the limits of the reader tasks of an understand run, read from the
// project settings. Values outside the DEC-117 ranges are brought inside them here as well, so a
// stored document written before the ranges were checked cannot start 500 parallel tasks.

/** DEC-117: `agents.parallelism` 1-8 and the reader's `maxTurns` 1-50. */
const PARALLELISM = { min: 1, max: 8 } as const;
const MAX_TURNS = { min: 1, max: 50, fallback: 12 } as const;
/** The context assumed when the settings give no number: Ollama's floor, a cloud model's usual size. */
const OLLAMA_CONTEXT_TOKENS = 32_768;
const CLOUD_CONTEXT_TOKENS = 128_000;
/** The share of the context a conversation may fill before the task ends (architecture section 8). */
const CONTEXT_SHARE = 0.8;

function clamp(value: number, range: { readonly min: number; readonly max: number }): number {
  return Math.min(range.max, Math.max(range.min, Math.floor(value)));
}

/** How many reader tasks run at once. */
export function readerParallelism(settings: ProjectSettings): number {
  return clamp(settings.agents.parallelism, PARALLELISM);
}

function contextTokensOf(settings: ProjectSettings, role: RoleProvider): number {
  const configured = settings.providers[role.name]?.contextTokens;
  if (typeof configured === 'number') return configured;
  return role.kind === 'ollama' ? OLLAMA_CONTEXT_TOKENS : CLOUD_CONTEXT_TOKENS;
}

// RF-201
export function readerTaskSettings(
  settings: ProjectSettings,
  role: RoleProvider,
): AgentTaskRequest['settings'] {
  const maxTurns = clamp(settings.roles.reader.maxTurns ?? MAX_TURNS.fallback, MAX_TURNS);
  return {
    model: role.model,
    maxTurns,
    contextTokens: contextTokensOf(settings, role),
    contextShare: CONTEXT_SHARE,
    maxOutputTokens: role.maxOutputTokens,
    ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
  };
}

/** RF-144: a read_file call returns at most `scan.excerptMaxLines` lines. */
export function readerToolLimits(settings: ProjectSettings): Partial<ToolLimits> {
  return { maxReadLines: settings.scan.excerptMaxLines };
}
