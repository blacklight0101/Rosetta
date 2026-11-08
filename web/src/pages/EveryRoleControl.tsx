import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import type { ModelListState } from './model-lists.js';

// RF-436, DEC-225, P8-73, design-system.md section 7: the every-role control of the
// `P8ProjectSettings` artboard, at the top of the Roles section. It lists only the
// providers the user can use; Apply hands the provider, and the model when one was chosen, to the
// form, which changes the four roles in its draft. Save settings stays the only save.

/** The model value that means "the model choosing the provider selects for each role". */
const recommendedPerRole = '';

/** A provider of the list; a disabled one is shown but cannot be chosen (P8-74). */
interface ProviderOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: true;
}

interface EveryRoleProps {
  readonly providers: readonly ProviderOption[];
  readonly lists: Readonly<Record<string, ModelListState>>;
  /** An empty model asks for the recommended one per role. */
  readonly onApply: (provider: string, model: string) => void;
}

function modelOptions(list: ModelListState | undefined) {
  const listed = list?.status === 'ready' ? list.models : [];
  return [
    { value: recommendedPerRole, label: 'The recommended one per role' },
    ...listed.map((entry) => ({ value: entry.model, label: entry.label })),
  ];
}

// RF-436
export function EveryRoleControl({
  providers,
  lists,
  onApply,
}: EveryRoleProps): JSX.Element | null {
  const [chosen, setChosen] = useState({ provider: '', model: recommendedPerRole });
  const choosable = providers.filter((each) => each.disabled !== true);
  const first = choosable[0];
  if (first === undefined) return null;
  const provider = choosable.some((each) => each.value === chosen.provider)
    ? chosen.provider
    : first.value;
  const model = provider === chosen.provider ? chosen.model : recommendedPerRole;
  return (
    <div class="rst-every-role" role="group" aria-label="Use for every role">
      <Field
        kind="select"
        id="every-role-provider"
        label="Provider for every role"
        value={provider}
        options={providers}
        onChange={(value) => {
          setChosen({ provider: value, model: recommendedPerRole });
        }}
      />
      <Field
        kind="select"
        id="every-role-model"
        label="Model"
        value={model}
        options={modelOptions(lists[provider])}
        onChange={(value) => {
          setChosen({ provider, model: value });
        }}
      />
      <Button
        variant="primary"
        onClick={() => {
          onApply(provider, model);
        }}
      >
        Apply to every role
      </Button>
    </div>
  );
}
