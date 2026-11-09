import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { EveryRoleControl } from './EveryRoleControl.js';
import { RoleWarning } from './RoleWarning.js';
import type { RoleWarningFacts } from './role-warning.js';
import { LimitSetting } from './LimitSetting.js';
import { OllamaContextField } from './OllamaContextField.js';
import type { ModelListState } from './model-lists.js';
import type { RoleState } from './role-state.js';
import { roleTitles, RolesTable } from './RolesTable.js';
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

// RF-002, RF-405, RF-436, DEC-116, DEC-117, DEC-156, design-system.md section 14: the Roles section.
// The provider and model of each agent role are the Roles table of the `P8ProjectSettings` artboard
// (P8-135); under it the output limit of each role and the reader's turn limit, as sliders (P2-15).

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
      label={`${roleTitles[role]} max output tokens`}
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

/** The output limit of each role and the reader's turn limit, under the table. */
function RoleLimits(
  props: SectionProps & { readonly lists: Readonly<Record<string, ModelListState>> },
): JSX.Element {
  const { lists, ...section } = props;
  return (
    <div class="rst-settings__grid">
      {ROLE_NAMES.map((role) => (
        <OutputTokens
          key={role}
          {...section}
          role={role}
          list={lists[section.editor.draft.roles[role].provider]}
        />
      ))}
      <ReaderTurns {...section} />
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
  /** RF-436, P8-135: whether each role's provider can be used now, for the State column. */
  readonly states: Readonly<Record<RoleName, RoleState | undefined>>;
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
        <div class="rst-roles__head">
          <h2 id="models" class="rst-settings__heading">
            Roles
          </h2>
          <p class="rst-settings__note">
            Choosing a provider selects its recommended model; change it if you want another.
          </p>
        </div>
        {warning === undefined ? (
          <EveryRoleControl providers={props.usable} lists={lists} onApply={applyToEveryRole} />
        ) : null}
        <RolesTable
          {...props}
          labelledBy="models"
          states={props.states}
          chooseProvider={chooseProvider}
        />
        <RoleLimits {...props} />
        <OllamaContext {...props} limit={props.limit} />
      </section>
    </>
  );
}
