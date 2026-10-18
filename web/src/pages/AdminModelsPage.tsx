import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getDefaultRoles, saveDefaultRoles } from '../api/admin.js';
import { defaultRoleNames, type DefaultRoleName, type DefaultRoles } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { namesAField, problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { BuiltInDefaults } from './BuiltInDefaults.js';
import { defaultModelProviders } from './provider-choices.js';

// DEC-106, design-system.md section 14: the provider and the dated model each role of a new project
// starts with. A role left on "Template default" is left out of the saved setting and keeps the
// template's model. Projects that exist are not touched. The server refuses an unknown provider.

const roleText: Readonly<
  Record<DefaultRoleName, { readonly title: string; readonly purpose: string }>
> = {
  reader: { title: 'Reader', purpose: 'Reads each area of the code and writes the cards.' },
  verifier: { title: 'Verifier', purpose: 'Checks every claim against its evidence.' },
  planner: { title: 'Planner', purpose: 'Writes the architecture, decisions and roadmap.' },
  summariser: { title: 'Summariser', purpose: 'Writes the short summaries.' },
};

const providerOptions = [
  { value: '', label: 'Template default' },
  ...defaultModelProviders,
] as const;

interface RoleDraft {
  readonly provider: string;
  readonly model: string;
}

type Draft = Readonly<Record<DefaultRoleName, RoleDraft>>;

const draftOf = (roles: DefaultRoles): Draft => ({
  reader: roles.reader ?? { provider: '', model: '' },
  verifier: roles.verifier ?? { provider: '', model: '' },
  planner: roles.planner ?? { provider: '', model: '' },
  summariser: roles.summariser ?? { provider: '', model: '' },
});

/** The roles that name a provider, with their model trimmed; the roles missing a model. */
function rolesOf(draft: Draft): {
  readonly roles: DefaultRoles;
  readonly missing: readonly DefaultRoleName[];
} {
  const chosen = defaultRoleNames.filter((name) => draft[name].provider !== '');
  const missing = chosen.filter((name) => draft[name].model.trim() === '');
  const roles = Object.fromEntries(
    chosen.map((name) => [
      name,
      { provider: draft[name].provider, model: draft[name].model.trim() },
    ]),
  );
  return { roles, missing };
}

interface Editing {
  /** The default models as last saved: empty until the administrator sets one. */
  readonly applied: DefaultRoles;
  readonly draft: Draft;
  readonly missing: readonly DefaultRoleName[];
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly refusals: number;
  readonly edit: (name: DefaultRoleName, patch: Partial<RoleDraft>) => void;
  readonly submit: () => Promise<void>;
}

function useEditing(saved: DefaultRoles): Editing {
  const { client } = useApp();
  const [draft, setDraft] = useState(draftOf(saved));
  const [applied, setApplied] = useState(saved);
  const [missing, setMissing] = useState<readonly DefaultRoleName[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');
  const [refusals, setRefusals] = useState(0);

  const submit = async (): Promise<void> => {
    const parsed = rolesOf(draft);
    setFailure(undefined);
    setMessage('');
    setMissing(parsed.missing);
    if (parsed.missing.length > 0) {
      setRefusals((count) => count + 1);
      return;
    }
    setBusy(true);
    const result = await saveDefaultRoles(client, parsed.roles);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      setRefusals((count) => count + 1);
      return;
    }
    setDraft(draftOf(result.value));
    setApplied(result.value);
    setMessage('Default models saved.');
  };
  const edit = (name: DefaultRoleName, patch: Partial<RoleDraft>): void => {
    setDraft((current) => ({ ...current, [name]: { ...current[name], ...patch } }));
    setMissing((current) => current.filter((role) => role !== name));
  };
  return { applied, draft, missing, busy, failure, message, refusals, edit, submit };
}

function RoleFields(props: { readonly name: DefaultRoleName; readonly editing: Editing }) {
  const { name, editing } = props;
  const { title, purpose } = roleText[name];
  const role = editing.draft[name];
  return (
    <div class="rst-role" data-testid="default-role">
      <div>
        <h3 class="rst-role__name">{title}</h3>
        <p class="rst-settings__note">{purpose}</p>
      </div>
      <div class="rst-role__fields">
        <Field
          kind="select"
          id={`default-${name}-provider`}
          label={`${title} provider`}
          value={role.provider}
          options={providerOptions}
          error={problemFor(editing.failure, `${name}.provider`)}
          announce={false}
          onChange={(provider) => {
            editing.edit(name, { provider });
          }}
        />
        <Field
          kind="text"
          id={`default-${name}-model`}
          label={`${title} model`}
          placeholder="Dated model id"
          value={role.model}
          disabled={role.provider === ''}
          error={
            editing.missing.includes(name)
              ? { message: 'Enter the dated model id for this provider.' }
              : problemFor(editing.failure, `${name}.model`)
          }
          announce={false}
          onInput={(model) => {
            editing.edit(name, { model });
          }}
        />
      </div>
    </div>
  );
}

function ModelsForm(props: {
  readonly saved: DefaultRoles;
  readonly builtIn: DefaultRoles;
}): JSX.Element {
  const { saved, builtIn } = props;
  const editing = useEditing(saved);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, editing.refusals);
  return (
    <form
      ref={formRef}
      class="rst-card rst-settings__section"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void editing.submit();
      }}
    >
      {editing.failure === undefined ||
      namesAField(
        editing.failure,
        defaultRoleNames.flatMap((name) => [`${name}.provider`, `${name}.model`]),
      ) ? null : (
        <ErrorBanner error={editing.failure} />
      )}
      <BuiltInDefaults applied={editing.applied} builtIn={builtIn} />
      <p class="rst-settings__note">
        A new project starts with these. A role left on Template default keeps the model of the
        template. Projects that exist keep their own models.
      </p>
      {defaultRoleNames.map((name) => (
        <RoleFields key={name} name={name} editing={editing} />
      ))}
      <div class="rst-projects__actions">
        <Button type="submit" variant="primary" busy={editing.busy}>
          Save default models
        </Button>
      </div>
      <p class="rst-settings__note" role="status">
        {editing.message}
      </p>
    </form>
  );
}

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly saved: DefaultRoles; readonly builtIn: DefaultRoles };

function useSavedRoles(): Loaded {
  const { client } = useApp();
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void getDefaultRoles(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', saved: result.value.roles, builtIn: result.value.builtIn }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return state;
}

// DEC-106
export function AdminModelsPage(): JSX.Element {
  const loaded = useSavedRoles();
  return (
    <div class="rst-settings rst-admin">
      <div>
        <h1 class="rst-page__title">Default models</h1>
        <p class="rst-settings__lead">
          The provider and model each role of a new project starts with.
        </p>
      </div>
      {loaded.status === 'loading' ? (
        <p class="rst-loading" role="status">
          Loading the default models
        </p>
      ) : null}
      {loaded.status === 'failed' ? <ErrorBanner error={loaded.error} /> : null}
      {loaded.status === 'ready' ? (
        <ModelsForm saved={loaded.saved} builtIn={loaded.builtIn} />
      ) : null}
    </div>
  );
}
