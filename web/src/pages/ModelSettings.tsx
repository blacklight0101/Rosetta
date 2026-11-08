import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { EveryRoleControl } from './EveryRoleControl.js';
import { RoleWarning } from './RoleWarning.js';
import type { RoleWarningFacts } from './role-warning.js';
import { LimitSetting } from './LimitSetting.js';
import { ModelChoice } from './ModelChoice.js';
import { OllamaContextField } from './OllamaContextField.js';
import { recommendedModel, type ModelListState } from './model-lists.js';
import { ProviderSetting } from './SettingFields.js';
import type { SectionProps } from './settings-section.js';
import {
  builtInOutput,
  formatValue,
  ranges,
  templateDefaults,
  type Range,
} from './setting-limits.js';
import { contextPath, usesOllama, type ContextLimit } from './ollama-context.js';
import { useProviderChoice } from './use-recommended-model.js';

// RF-002, RF-405, RF-436, DEC-116, DEC-117, DEC-156, design-system.md section 14: the provider, model and
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

/** Q-57, RF-436 (P8-76): what an empty output limit means, in the words of the design board. */
const unsetOutputHelp = (builtIn: number): string =>
  `${formatValue(builtIn, 'count')} is the default. The field and the slider always show the same value.`;

/** The maximum output the shipped list gives the chosen model, once the list has come. */
function listedMaximum(list: ModelListState | undefined, model: string): number | undefined {
  const listed = list?.status === 'ready' ? list.models.find((e) => e.model === model) : undefined;
  return listed?.maxOutputTokens;
}

/** DEC-163: the output slider tops out at the maximum the chosen model lists, else 32,768. */
function outputRange(list: ModelListState | undefined, model: string): Range {
  return {
    ...ranges.maxOutputTokens,
    max: listedMaximum(list, model) ?? ranges.maxOutputTokens.max,
  };
}

function OutputTokens({
  editor,
  errorFor,
  kindOf,
  role,
  list,
}: SectionProps & {
  readonly role: RoleName;
  readonly list: ModelListState | undefined;
}): JSX.Element {
  const draft = editor.draft.roles[role];
  // RF-436 (P8-76): the default shown is the limit a run gives the role on this provider and model.
  const builtIn = builtInOutput(role, kindOf(draft.provider), listedMaximum(list, draft.model));
  return (
    <LimitSetting
      id={`role-${role}-output`}
      label={`${roleText[role].title} max output tokens`}
      path={`roles.${role}.maxOutputTokens`}
      errorFor={errorFor}
      range={outputRange(list, draft.model)}
      help={draft.maxOutputTokens.trim() === '' ? unsetOutputHelp(builtIn) : undefined}
      unit="count"
      defaultValue={builtIn}
      emptyAt={builtIn}
      value={draft.maxOutputTokens}
      onInput={(maxOutputTokens) => {
        editor.changeRole(role, { maxOutputTokens });
      }}
    />
  );
}

function RoleFields(
  props: SectionProps & {
    readonly role: RoleName;
    readonly list: ModelListState | undefined;
    readonly chooseProvider: (role: RoleName, provider: string) => void;
  },
): JSX.Element {
  const { editor, errorFor, providers, role, list, chooseProvider } = props;
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
            chooseProvider(role, provider);
          }}
        />
        <ModelChoice
          key={draft.provider}
          id={`role-${role}-model`}
          label={`${title} model`}
          value={draft.model}
          list={list}
          needsTools={role === 'reader'}
          recommended={recommendedModel(draft.provider, list, role === 'reader')}
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

/**
 * RF-436, P8-74: Apply in the warning makes every role usable, so the warning goes; focus then
 * moves to the every-role control in its usual place instead of being lost with the warning.
 */
function useApplyFromWarning(
  warned: boolean,
  apply: (provider: string, model: string) => void,
): (provider: string, model: string) => void {
  const applied = useRef(false);
  useEffect(() => {
    if (warned || !applied.current) return;
    applied.current = false;
    document.getElementById('every-role-provider')?.focus();
  }, [warned]);
  return (provider, model) => {
    applied.current = true;
    apply(provider, model);
  };
}

type ModelSettingsProps = SectionProps & {
  readonly lists: Readonly<Record<string, ModelListState>>;
  readonly limit: ContextLimit | undefined;
  /** RF-436, DEC-225: the providers the user can use now, for the every-role control. */
  readonly usable: readonly { readonly value: string; readonly label: string }[];
  /** RF-436, P8-74: the warning on roles that cannot be used now; it holds the control. */
  readonly warning: RoleWarningFacts | undefined;
};

// RF-002
export function ModelSettings(props: ModelSettingsProps): JSX.Element {
  const { lists } = props;
  const chooseProvider = useProviderChoice(props.editor, lists);
  // RF-436, P8-73: each role takes the provider as if it were chosen for that role alone, so the
  // P8-72 rule picks its model; a model chosen in the control goes to all four instead.
  const applyToEveryRole = (provider: string, model: string): void => {
    for (const role of ROLE_NAMES) {
      if (model === '') chooseProvider(role, provider);
      else props.editor.changeRole(role, { provider, model });
    }
  };
  const { warning } = props;
  const applyFromWarning = useApplyFromWarning(warning !== undefined, applyToEveryRole);
  return (
    <>
      {warning === undefined ? null : (
        <RoleWarning facts={warning} lists={lists} onApply={applyFromWarning} />
      )}
      <section class="rst-card rst-settings__section" aria-labelledby="models">
        <h2 id="models" class="rst-settings__heading">
          Models per role
        </h2>
        <p class="rst-settings__note">
          Every role names a provider and a model. A provider the project did not use before is
          added with its usual settings; keys are kept on the Settings and keys page. Choosing a
          provider selects its recommended model; change it if you want another.
        </p>
        {warning === undefined ? (
          <EveryRoleControl providers={props.usable} lists={lists} onApply={applyToEveryRole} />
        ) : null}
        {ROLE_NAMES.map((role) => (
          <RoleFields
            key={role}
            {...props}
            role={role}
            chooseProvider={chooseProvider}
            list={lists[props.editor.draft.roles[role].provider]}
          />
        ))}
        <OllamaContext {...props} limit={props.limit} />
      </section>
    </>
  );
}
