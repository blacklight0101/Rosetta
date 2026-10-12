import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import type { FieldIssue } from './use-settings-editor.js';

// P1-41: the fields of the project settings form. Each one shows what the last refusal said about
// its path and leaves the announcing to the focus: after a refused save focus goes to the first
// invalid control, which reads its error through aria-describedby (a live region as well would say
// it twice).

interface SettingBase {
  readonly id: string;
  readonly label: string;
  /** The path the server uses for this setting, for example `roles.reader.model`. */
  readonly path: string;
  readonly errorFor: (path: string) => FieldIssue | undefined;
  readonly help?: string;
}

export function NumberSetting(
  props: SettingBase & { readonly value: string; readonly onInput: (value: string) => void },
): JSX.Element {
  return (
    <Field
      kind="number"
      id={props.id}
      label={props.label}
      value={props.value}
      help={props.help}
      error={props.errorFor(props.path)}
      announce={false}
      onInput={props.onInput}
    />
  );
}

export function TextSetting(
  props: SettingBase & { readonly value: string; readonly onInput: (value: string) => void },
): JSX.Element {
  return (
    <Field
      kind="text"
      id={props.id}
      label={props.label}
      value={props.value}
      help={props.help}
      error={props.errorFor(props.path)}
      announce={false}
      onInput={props.onInput}
    />
  );
}

export function ProviderSetting(
  props: SettingBase & {
    readonly value: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly onChange: (value: string) => void;
  },
): JSX.Element {
  return (
    <Field
      kind="select"
      id={props.id}
      label={props.label}
      value={props.value}
      options={props.options}
      help={props.help}
      error={props.errorFor(props.path)}
      announce={false}
      onChange={props.onChange}
    />
  );
}
