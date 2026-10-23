import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Field } from '../components/Field.js';
import type { ModelListState, ModelOption } from './model-lists.js';

// RF-405, RF-427, DEC-156, design-system.md section 14: the model of a role. With a list, a select
// of the listed models (a model without a price says "no price") that ends with "Other model...",
// which shows a text field; a saved model that is not listed stays selected there. Without a list,
// or when Ollama cannot be asked, the plain text field stays, with a note, so saving still works.
// The parent keys this component by the provider, so the choice starts again when it changes.

export interface ModelChoiceProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  /** P3-130: the role calls tools, so a model that cannot call them is flagged. */
  readonly needsTools?: boolean;
  /** The list of the role's provider; undefined for a provider with no list. */
  readonly list: ModelListState | undefined;
  readonly error: { readonly code?: string; readonly message: string } | undefined;
  readonly placeholder?: string;
  readonly onChange: (model: string) => void;
}

/** The value of the last option; no model id is ever this. */
const OTHER = '__other__';

const noPrice =
  'This model has no price in the price table: a server key refuses it, and your own key needs a price override or "Allow models missing from the price table".';

/** The note under the plain text field, when there is a reason to give one. */
function noteOf(list: ModelListState | undefined): string | undefined {
  if (list?.status === 'failed')
    return 'The list of models could not be loaded. Type the model id.';
  if (list?.status !== 'ready') return undefined;
  if (list.reason !== undefined) return `${list.reason} Type the model id.`;
  return 'No models are listed for this provider. Type the model id.';
}

function optionsOf(models: readonly ModelOption[]): readonly { value: string; label: string }[] {
  return [
    { value: '', label: 'Choose a model' },
    ...models.map(({ model, label, priced }) => ({
      value: model,
      label: priced ? label : `${label} (no price)`,
    })),
    { value: OTHER, label: 'Other model...' },
  ];
}

function PlainText(props: ModelChoiceProps): JSX.Element {
  return (
    <Field
      kind="text"
      id={props.id}
      label={props.label}
      {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
      value={props.value}
      disabled={props.disabled === true}
      help={props.disabled === true ? undefined : noteOf(props.list)}
      error={props.error}
      announce={false}
      onInput={props.onChange}
    />
  );
}

function Listed(
  props: ModelChoiceProps & { readonly models: readonly ModelOption[] },
): JSX.Element {
  const { id, value, models, error, onChange } = props;
  const [other, setOther] = useState(false);
  const chosen = models.find((entry) => entry.model === value);
  const showText = other || (value !== '' && chosen === undefined);
  useEffect(() => {
    if (other) document.getElementById(`${id}-other`)?.focus();
  }, [id, other]);
  return (
    <>
      <Field
        kind="select"
        id={id}
        label={props.label}
        value={showText ? OTHER : value}
        options={optionsOf(models)}
        help={!showText && chosen?.priced === false ? noPrice : undefined}
        error={showText ? undefined : error}
        announce={false}
        onChange={(next) => {
          setOther(next === OTHER);
          onChange(next === OTHER ? '' : next);
        }}
      />
      {showText ? (
        <Field
          kind="text"
          id={`${id}-other`}
          label={`${props.label.replace(/ model$/u, '')} other model`}
          placeholder="Model id"
          value={value}
          error={error}
          announce={false}
          onInput={onChange}
        />
      ) : null}
    </>
  );
}

// RF-405
export function ModelChoice(props: ModelChoiceProps): JSX.Element {
  const { list } = props;
  if (props.disabled === true || list?.status !== 'ready' || list.models.length === 0) {
    return <PlainText {...props} />;
  }
  return <Listed {...props} models={list.models} />;
}
