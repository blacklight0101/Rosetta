import type { ProjectSettings } from '../../src/application/projects/project-settings.js';

// Q-57: settings as a new project has them, where no role stores an output limit and every role
// takes the default of its model (hosted) or of Ollama.

type RoleSettings = ProjectSettings['roles'][keyof ProjectSettings['roles']];

function withoutLimit(role: RoleSettings): RoleSettings {
  const { provider, model, temperature } = role;
  return { provider, model, ...(temperature === undefined ? {} : { temperature }) };
}

/** The settings with the output limit of every role removed; the turn limit of the reader stays. */
export function withoutOutputLimits(settings: ProjectSettings): ProjectSettings {
  const { reader, verifier, planner, summariser } = settings.roles;
  return {
    ...settings,
    roles: {
      reader: { ...withoutLimit(reader), maxTurns: reader.maxTurns },
      verifier: withoutLimit(verifier),
      planner: withoutLimit(planner),
      summariser: withoutLimit(summariser),
    },
  };
}
