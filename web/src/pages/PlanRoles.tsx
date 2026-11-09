import type { JSX } from 'preact';
import type { Project } from '../api/project-schemas.js';
import { OllamaSwitch } from './OllamaSwitch.js';
import { providerLabel } from './provider-choices.js';
import type { PrivateCode } from './use-private-code.js';

// RF-605, RF-132, P8-82, design-system.md section 14 (Plan setup): the roles summary. It names each
// role with its provider and model and, when the private-code box is asked, holds "Switch every role
// to Ollama", so the switch sits away from the consent boxes and the start button.

const ROLES = [
  ['reader', 'Reader'],
  ['verifier', 'Verifier'],
  ['planner', 'Planner'],
  ['summariser', 'Summariser'],
] as const;

const titleId = 'plan-roles-title';

// RF-605
export function PlanRoles(props: {
  readonly project: Project;
  readonly privateCode: PrivateCode;
}): JSX.Element {
  const { roles } = props.project.settings;
  const { needed, switchToOllama } = props.privateCode;
  return (
    <section class="rst-plan-card" aria-labelledby={titleId}>
      <h2 id={titleId} class="rst-plan-card__title">
        Roles
      </h2>
      <dl class="rst-plan-recorded">
        {ROLES.map(([key, name]) => (
          <div key={key}>
            <dt>{name}</dt>
            <dd class="rst-mono">{`${providerLabel(roles[key].provider)} / ${roles[key].model}`}</dd>
          </div>
        ))}
      </dl>
      {needed ? (
        <OllamaSwitch
          onSwitch={switchToOllama.run}
          switching={switchToOllama.switching}
          switchError={switchToOllama.error}
        />
      ) : null}
    </section>
  );
}
