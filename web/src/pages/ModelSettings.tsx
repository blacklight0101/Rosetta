import type { JSX } from 'preact';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { NumberSetting, ProviderSetting, TextSetting } from './SettingFields.js';
import type { SectionProps } from './settings-section.js';

// RF-002, RF-405, DEC-116, design-system.md section 14: the provider, model and output limit of
// each agent role; only the reader has a turn limit.

const roleText: Readonly<Record<RoleName, { readonly title: string; readonly purpose: string }>> = {
  reader: { title: 'Reader', purpose: 'Reads each area of the code and writes the cards.' },
  verifier: { title: 'Verifier', purpose: 'Checks every claim against its evidence.' },
  planner: { title: 'Planner', purpose: 'Writes the architecture, decisions and roadmap.' },
  summariser: { title: 'Summariser', purpose: 'Writes the short summaries.' },
};

function ReaderTurns({ editor, errorFor }: SectionProps): JSX.Element {
  return (
    <NumberSetting
      id="role-reader-turns"
      label="Reader max turns"
      path="roles.reader.maxTurns"
      help="Model calls one reader task may make before it stops."
      errorFor={errorFor}
      value={editor.draft.roles.reader.maxTurns}
      onInput={(maxTurns) => {
        editor.changeRole('reader', { maxTurns });
      }}
    />
  );
}

function RoleFields(props: SectionProps & { readonly role: RoleName }): JSX.Element {
  const { editor, errorFor, providers, role } = props;
  const { title, purpose } = roleText[role];
  const draft = editor.draft.roles[role];
  const path = `roles.${role}`;
  return (
    <div class="rst-role" data-testid="role-settings">
      <div>
        <h3 class="rst-role__name">{title}</h3>
        <p class="rst-settings__note">{purpose}</p>
      </div>
      <div class="rst-role__fields">
        <ProviderSetting
          id={`role-${role}-provider`}
          label={`${title} provider`}
          path={`${path}.provider`}
          errorFor={errorFor}
          options={providers}
          value={draft.provider}
          onChange={(provider) => {
            editor.changeRole(role, { provider });
          }}
        />
        <TextSetting
          id={`role-${role}-model`}
          label={`${title} model`}
          path={`${path}.model`}
          errorFor={errorFor}
          value={draft.model}
          onInput={(model) => {
            editor.changeRole(role, { model });
          }}
        />
        <NumberSetting
          id={`role-${role}-output`}
          label={`${title} max output tokens`}
          path={`${path}.maxOutputTokens`}
          errorFor={errorFor}
          value={draft.maxOutputTokens}
          onInput={(maxOutputTokens) => {
            editor.changeRole(role, { maxOutputTokens });
          }}
        />
        {role === 'reader' ? <ReaderTurns {...props} /> : null}
      </div>
    </div>
  );
}

// RF-002
export function ModelSettings(props: SectionProps): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="models">
      <h2 id="models" class="rst-settings__heading">
        Models per role
      </h2>
      <p class="rst-settings__note">
        Every role names a provider and a model. A provider the project did not use before is added
        with its usual settings; keys are kept on the Settings and keys page.
      </p>
      {ROLE_NAMES.map((role) => (
        <RoleFields key={role} {...props} role={role} />
      ))}
    </section>
  );
}
