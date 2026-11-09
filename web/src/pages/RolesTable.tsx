import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { ModelChoice } from './ModelChoice.js';
import { recommendedModel, type ModelListState } from './model-lists.js';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import type { RoleState } from './role-state.js';
import { ProviderSetting } from './SettingFields.js';
import type { SectionProps } from './settings-section.js';

// RF-436, P8-135, the Roles table of the `P8ProjectSettings` artboard (DEC-211, DEC-224) and the
// Data table of design-system.md section 5: one row per role with its provider, its model and
// whether the provider can be used now. The fields keep their labels ("Reader provider"), hidden
// where the column names them; below 640 px the rows stack and each cell shows its column name.

export const roleTitles: Readonly<Record<RoleName, string>> = {
  reader: 'Reader',
  verifier: 'Verifier',
  planner: 'Planner',
  summariser: 'Summariser',
};

const stateWords: Readonly<Record<RoleState, { readonly text: string; readonly ready: boolean }>> =
  {
    'key-ready': { text: 'Key ready', ready: true },
    'no-key': { text: 'No key', ready: false },
    reachable: { text: 'Reachable', ready: true },
    'not-reachable': { text: 'Not reachable', ready: false },
  };

function StateCell({ state }: { readonly state: RoleState | undefined }): JSX.Element {
  if (state === undefined) return <td class="rst-roles__state" data-label="State" />;
  const { text, ready } = stateWords[state];
  return (
    <td
      class={`rst-roles__state rst-roles__state--${ready ? 'ready' : 'blocked'}`}
      data-label="State"
    >
      <Glyph name={ready ? 'check' : 'cross'} /> {text}
    </td>
  );
}

type RowProps = SectionProps & {
  readonly role: RoleName;
  readonly list: ModelListState | undefined;
  readonly state: RoleState | undefined;
  readonly chooseProvider: (role: RoleName, provider: string) => void;
};

function RoleRow(props: RowProps): JSX.Element {
  const { editor, errorFor, providers, role, list, chooseProvider } = props;
  const title = roleTitles[role];
  const draft = editor.draft.roles[role];
  return (
    <tr>
      <th scope="row">
        <span class="rst-roles__role">
          <span class={`rst-roles__dot rst-roles__dot--${role}`} aria-hidden="true" />
          {title}
        </span>
      </th>
      <td data-label="Provider">
        <ProviderSetting
          id={`role-${role}-provider`}
          label={`${title} provider`}
          path={`roles.${role}.provider`}
          errorFor={errorFor}
          options={providers}
          value={draft.provider}
          onChange={(provider) => {
            chooseProvider(role, provider);
          }}
        />
      </td>
      <td data-label="Model">
        <ModelChoice
          key={draft.provider}
          id={`role-${role}-model`}
          label={`${title} model`}
          value={draft.model}
          list={list}
          needsTools={role === 'reader'}
          recommended={recommendedModel(draft.provider, list, role === 'reader')}
          error={errorFor(`roles.${role}.model`)}
          onChange={(model) => {
            editor.changeRole(role, { model });
          }}
        />
      </td>
      <StateCell state={props.state} />
    </tr>
  );
}

type RolesTableProps = SectionProps & {
  /** The id of the heading that names the table. */
  readonly labelledBy: string;
  readonly lists: Readonly<Record<string, ModelListState>>;
  readonly states: Readonly<Record<RoleName, RoleState | undefined>>;
  readonly chooseProvider: (role: RoleName, provider: string) => void;
};

// RF-436
export function RolesTable(props: RolesTableProps): JSX.Element {
  const { lists, states, labelledBy, ...section } = props;
  // The scroll box keeps a table wider than its box from scrolling the page sideways (P8-130).
  return (
    <div class="rst-table-scroll">
      <table class="rst-table rst-table--stack rst-roles" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Provider</th>
            <th scope="col">Model</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_NAMES.map((role) => (
            <RoleRow
              key={role}
              {...section}
              role={role}
              state={states[role]}
              list={lists[section.editor.draft.roles[role].provider]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
