import {
  noToolsReason,
  TOOL_ROLES,
  type ToolLessModels,
} from '../../application/models/model-list.js';
import type { AgentRole } from '../../application/ports/llm-provider.js';
import type { ProviderProblem } from '../../application/ports/provider-set-factory.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { err, type Result } from '../../domain/errors/result.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';

// P3-130, RF-402: a model the shipped list marks `noTools` (it cannot call tools on Chat
// Completions) is refused for a role that calls tools, when the provider set is built and so before
// any call. A role without tools may use it. The message names the model and the role.
export function toolRoleProblem(
  toolLess: ToolLessModels | undefined,
  settings: ProjectSettings,
  role: AgentRole,
): Result<never, ProviderProblem> | undefined {
  if (toolLess === undefined || !TOOL_ROLES.includes(role)) return undefined;
  const { provider: name, model } = settings.roles[role];
  const config = Object.hasOwn(settings.providers, name) ? settings.providers[name] : undefined;
  if (config === undefined || !toolLess(config.kind, model)) return undefined;
  return err({
    role,
    provider: name,
    code: ERROR_CODES.modelCannotCallTools,
    message: noToolsReason(model, role),
  });
}
