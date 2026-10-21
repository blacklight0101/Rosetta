import type { JSX } from 'preact';
import { defaultRoleNames, type DefaultRoles } from '../api/admin-schemas.js';

// DEC-106: while the administrator has set no default model, a new project starts with the models of
// the template. The note says so and names them, so an empty setting is not read as "no model".

const titles = {
  reader: 'Reader',
  verifier: 'Verifier',
  planner: 'Planner',
  summariser: 'Summariser',
} as const;

// DEC-106
export function BuiltInDefaults(props: {
  readonly applied: DefaultRoles;
  readonly builtIn: DefaultRoles;
}): JSX.Element | null {
  const { applied, builtIn } = props;
  if (defaultRoleNames.some((name) => applied[name] !== undefined)) return null;
  return (
    <div class="rst-callout rst-callout--info" data-testid="built-in-defaults">
      <p class="rst-settings__note">
        No default models are set, so the built-in defaults apply to every new project:
      </p>
      <ul>
        {defaultRoleNames.map((name) => {
          const role = builtIn[name];
          return role === undefined ? null : (
            <li key={name}>{`${titles[name]}: ${role.provider} / ${role.model}`}</li>
          );
        })}
      </ul>
    </div>
  );
}
