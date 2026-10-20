import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import type { ModelListState } from './model-lists.js';

// RF-405, DEC-156: skeleton.

export interface ModelChoiceProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  /** The list of the role's provider; undefined for a provider with no list. */
  readonly list: ModelListState | undefined;
  readonly error: { readonly code?: string; readonly message: string } | undefined;
  readonly placeholder?: string;
  readonly onChange: (model: string) => void;
}

export function ModelChoice(props: ModelChoiceProps): JSX.Element {
  return (
    <Field
      kind="text"
      id={props.id}
      label={props.label}
      value={props.value}
      disabled={props.disabled === true}
      error={props.error}
      announce={false}
      onInput={props.onChange}
    />
  );
}
