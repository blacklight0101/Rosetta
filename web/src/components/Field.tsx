import type { JSX, TargetedInputEvent } from 'preact';

// design-system.md section 5: a labelled form field with help and error text. The label is bound
// to the control, the help and the error through aria-describedby, and the error carries the
// `RST` code when there is one (section 7). Text, URL, password, number, textarea, select, radio
// checkbox, file (one file chosen from the computer, for the zip upload) and files (several).

interface FieldError {
  readonly code?: string;
  readonly message: string;
}

interface FieldOption {
  readonly value: string;
  readonly label: string;
}

interface FieldBase {
  /** Unique in the page; the help and error ids derive from it. */
  readonly id: string;
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: FieldError | undefined;
  /** The id of other text that describes the control, for example a rule checklist. */
  readonly describedBy?: string | undefined;
  readonly disabled?: boolean;
  /**
   * False when the page moves focus to the invalid control after a refusal: the control already
   * reads its error through aria-describedby, so a live region would say it a second time.
   */
  readonly announce?: boolean;
}

interface TextField extends FieldBase {
  readonly kind: 'text' | 'url' | 'password' | 'number';
  readonly value: string;
  readonly placeholder?: string;
  /** The browser's `autocomplete` token, for example `username` or `new-password`. */
  readonly autoComplete?: string;
  readonly onInput: (value: string) => void;
}

interface TextareaField extends FieldBase {
  readonly kind: 'textarea';
  readonly value: string;
  readonly rows?: number;
  readonly onInput: (value: string) => void;
}

interface SelectField extends FieldBase {
  readonly kind: 'select';
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly onChange: (value: string) => void;
}

interface CheckboxField extends FieldBase {
  readonly kind: 'checkbox';
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

interface RadioField extends FieldBase {
  readonly kind: 'radio';
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly onChange: (value: string) => void;
}

interface FileField extends FieldBase {
  readonly kind: 'file';
  /** The `accept` list of the file chooser, for example `.zip,application/zip`. */
  readonly accept: string;
  readonly onFile: (file: File | undefined) => void;
}

interface FilesField extends FieldBase {
  readonly kind: 'files';
  /** The `accept` list of the file chooser, for example `.xlsx,.xlsm`. */
  readonly accept: string;
  /** Called with every file chosen, in the order the chooser gives them (none when cleared). */
  readonly onFiles: (files: readonly File[]) => void;
}

export type FieldProps =
  TextField | TextareaField | SelectField | CheckboxField | RadioField | FileField | FilesField;

const valueOf = (event: Event): string =>
  event.target instanceof HTMLInputElement ||
  event.target instanceof HTMLSelectElement ||
  event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : '';

function describedBy(props: FieldBase): string | undefined {
  const ids = [
    props.help === undefined ? '' : `${props.id}-help`,
    props.error === undefined ? '' : `${props.id}-error`,
    props.describedBy ?? '',
  ].filter((id) => id !== '');
  return ids.length === 0 ? undefined : ids.join(' ');
}

function commonAttributes(props: FieldBase): {
  readonly id: string;
  readonly disabled: boolean;
  readonly 'aria-invalid': 'true' | undefined;
  readonly 'aria-describedby': string | undefined;
} {
  return {
    id: props.id,
    disabled: props.disabled === true,
    'aria-invalid': props.error === undefined ? undefined : 'true',
    'aria-describedby': describedBy(props),
  };
}

function RadioGroup(props: RadioField): JSX.Element {
  const common = commonAttributes(props);
  return (
    <div class="rst-field__radios" role="radiogroup" aria-labelledby={`${props.id}-label`}>
      {props.options.map((option) => (
        <label key={option.value} class="rst-field__radio">
          <input
            type="radio"
            name={props.id}
            value={option.value}
            checked={props.value === option.value}
            disabled={common.disabled}
            aria-describedby={common['aria-describedby']}
            onChange={() => {
              props.onChange(option.value);
            }}
          />{' '}
          {option.label}
        </label>
      ))}
    </div>
  );
}

function SelectControl(props: SelectField): JSX.Element {
  return (
    <select
      {...commonAttributes(props)}
      class="rst-field__control"
      value={props.value}
      onChange={(event) => {
        props.onChange(valueOf(event));
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function InputControl(props: TextField): JSX.Element {
  const attributes = {
    ...commonAttributes(props),
    class: props.kind === 'url' ? 'rst-field__control rst-mono' : 'rst-field__control',
    value: props.value,
    placeholder: props.placeholder,
    autoComplete: props.autoComplete,
    onInput: (event: TargetedInputEvent<HTMLInputElement>) => {
      props.onInput(valueOf(event));
    },
  };
  // Preact 11 types the `type` attribute per input kind, so each kind is written out with its literal.
  switch (props.kind) {
    case 'number':
      return <input {...attributes} type="number" />;
    case 'url':
      return <input {...attributes} type="url" />;
    case 'password':
      return <input {...attributes} type="password" />;
    case 'text':
      return <input {...attributes} type="text" />;
  }
}

function FileControl(props: FileField | FilesField): JSX.Element {
  return (
    <input
      {...commonAttributes(props)}
      class="rst-field__control"
      type="file"
      multiple={props.kind === 'files'}
      accept={props.accept}
      onChange={(event) => {
        const chosen = Array.from(event.currentTarget.files ?? []);
        if (props.kind === 'files') props.onFiles(chosen);
        else props.onFile(chosen[0]);
      }}
    />
  );
}

const isFilePicker = (props: FieldProps): props is FileField | FilesField =>
  props.kind === 'file' || props.kind === 'files';

function TextareaControl(props: TextareaField): JSX.Element {
  return (
    <textarea
      {...commonAttributes(props)}
      class="rst-field__control rst-field__control--multiline rst-mono"
      rows={props.rows ?? 8}
      value={props.value}
      spellcheck={false}
      onInput={(event) => {
        props.onInput(valueOf(event));
      }}
    />
  );
}

function Control(props: FieldProps): JSX.Element {
  if (isFilePicker(props)) return <FileControl {...props} />;
  switch (props.kind) {
    case 'select':
      return <SelectControl {...props} />;
    case 'checkbox':
      return (
        <input
          {...commonAttributes(props)}
          class="rst-field__checkbox"
          type="checkbox"
          checked={props.checked}
          onChange={(event) => {
            props.onChange(event.currentTarget.checked);
          }}
        />
      );
    case 'radio':
      return <RadioGroup {...props} />;
    case 'textarea':
      return <TextareaControl {...props} />;
    case 'text':
    case 'number':
    case 'url':
    case 'password':
      return <InputControl {...props} />;
  }
}

function classesOf(props: FieldProps): string {
  const inline = props.kind === 'checkbox' ? ' rst-field--inline' : '';
  const invalid = props.error === undefined ? '' : ' rst-field--invalid';
  return `rst-field${inline}${invalid}`;
}

// RNF-008, RNF-010
export function Field(props: FieldProps): JSX.Element {
  return (
    <div class={classesOf(props)} data-testid="field">
      {props.kind === 'radio' ? (
        <span id={`${props.id}-label`} class="rst-field__label">
          {props.label}
        </span>
      ) : (
        <label class="rst-field__label" for={props.id}>
          {props.label}
        </label>
      )}
      <Control {...props} />
      {props.help === undefined ? null : (
        <p id={`${props.id}-help`} class="rst-field__help" data-testid="field-help">
          {props.help}
        </p>
      )}
      {props.error === undefined ? null : (
        <p
          id={`${props.id}-error`}
          class="rst-field__error"
          role={props.announce === false ? undefined : 'alert'}
          data-testid="field-error"
        >
          {props.error.code === undefined ? '' : `${props.error.code} · `}
          {props.error.message}
        </p>
      )}
    </div>
  );
}
