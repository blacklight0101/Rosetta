import type { JSX } from 'preact';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { LimitSetting } from './LimitSetting.js';
import { ModelChoice } from './ModelChoice.js';
import { OllamaContextField } from './OllamaContextField.js';
import type { ModelListState } from './model-lists.js';
import { ProviderSetting } from './SettingFields.js';
import type { SectionProps } from './settings-section.js';
import { ranges, templateDefaults, type Range } from './setting-limits.js';
import { contextPath, usesOllama, type ContextLimit } from './ollama-context.js';

// RF-002, RF-405, DEC-116, DEC-117, DEC-156, design-system.md section 14: the provider, model and
// output limit of each agent role; only the reader has a turn limit. The limits are sliders (P2-15).
// The model is chosen from the provider's list, with "Other model..." for free text.

const roleText: Readonly<Record<RoleName, { readonly title: string; readonly purpose: string }>> = {
  reader: { title: 'Reader', purpose: 'Reads each area of the code and writes the cards.' },
  verifier: { title: 'Verifier', purpose: 'Checks every claim against its evidence.' },
  planner: { title: 'Planner', purpose: 'Writes the architecture, decisions and roadmap.' },
  summariser: { title: 'Summariser', purpose: 'Writes the short summaries.' },
};

function ReaderTurns({ editor, errorFor }: SectionProps): JSX.Element {
  return (
    <LimitSetting
      id="role-reader-turns"
      label="Reader max turns"
      path="roles.reader.maxTurns"
      help="Model calls one reader task may make before it stops."
      errorFor={errorFor}
      range={ranges.maxTurns}
      unit="count"
      defaultValue={templateDefaults.maxTurns}
      value={editor.draft.roles.reader.maxTurns}
      onInput={(maxTurns) => {
        editor.changeRole('reader', { maxTurns });
      }}
    />
  );
}

/** Q-57: what an empty output limit means. */
const unsetOutputHelp = 'Not set: the role uses the default of its model.';

/** DEC-163: the output slider tops out at the maximum the chosen model lists, else 32,768. */
function outputRange(list: ModelListState | undefined, model: string): Range {
  const listed = list?.status === 'ready' ? list.models.find((e) => e.model === model) : undefined;
  return { ...ranges.maxOutputTokens, max: listed?.maxOutputTokens ?? ranges.maxOutputTokens.max };
}

function OutputTokens({
  editor,
  errorFor,
  role,
  list,
}: SectionProps & {
  readonly role: RoleName;
  readonly list: ModelListState | undefined;
}): JSX.Element {
  return (
    <LimitSetting
      id={`role-${role}-output`}
      label={`${roleText[role].title} max output tokens`}
      path={`roles.${role}.maxOutputTokens`}
      errorFor={errorFor}
      range={outputRange(list, editor.draft.roles[role].model)}
      help={editor.draft.roles[role].maxOutputTokens.trim() === '' ? unsetOutputHelp : undefined}
      unit="count"
      defaultValue={templateDefaults.maxOutputTokens[role]}
      emptyAt={templateDefaults.maxOutputTokens[role]}
      value={editor.draft.roles[role].maxOutputTokens}
      onInput={(maxOutputTokens) => {
        editor.changeRole(role, { maxOutputTokens });
      }}
    />
  );
}

function RoleFields(
  props: SectionProps & { readonly role: RoleName; readonly list: ModelListState | undefined },
): JSX.Element {
  const { editor, errorFor, providers, role, list } = props;
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
            editor.changeRole(role, { provider, model: '' });
          }}
        />
        <ModelChoice
          key={draft.provider}
          id={`role-${role}-model`}
          label={`${title} model`}
          value={draft.model}
          list={list}
          error={errorFor(`${path}.model`)}
          onChange={(model) => {
            editor.changeRole(role, { model });
          }}
        />
        <OutputTokens {...props} role={role} list={list} />
        {role === 'reader' ? <ReaderTurns {...props} /> : null}
      </div>
    </div>
  );
}

function OllamaContext({
  editor,
  errorFor,
  limit,
}: SectionProps & { readonly limit: ContextLimit | undefined }): JSX.Element | null {
  if (!usesOllama(editor.draft.roles)) return null;
  return (
    <OllamaContextField
      id="ollama-context"
      value={editor.draft.ollamaContext}
      scope="It applies to every Ollama role of this project."
      limit={limit}
      error={errorFor(contextPath)}
      onChange={(ollamaContext) => {
        editor.change({ ollamaContext });
      }}
    />
  );
}

// RF-002
export function ModelSettings(
  props: SectionProps & {
    readonly lists: Readonly<Record<string, ModelListState>>;
    readonly limit: ContextLimit | undefined;
  },
): JSX.Element {
  const { lists } = props;
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
        <RoleFields
          key={role}
          {...props}
          role={role}
          list={lists[props.editor.draft.roles[role].provider]}
        />
      ))}
      <OllamaContext {...props} limit={props.limit} />
    </section>
  );
}
