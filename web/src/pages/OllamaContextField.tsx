import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { problemFor } from '../api/problems.js';
import { Field } from '../components/Field.js';
import { CONTEXT_MIN, contextMax, type ContextLimit } from './ollama-context.js';
import type { ContextDraft } from './use-context-size.js';

// RF-401, Q-44, design-system.md section 5: the "Context size" of the Ollama provider, Auto or a
// number of tokens. The select picks the mode; the number field shows with it. The draft is the
// text `auto` or the digits.

export interface OllamaContextFieldProps {
  readonly id: string;
  /** `auto`, or the text of the number. */
  readonly value: string;
  readonly scope: string;
  /** The trained context that bounds a number (Q-44); undefined when none is known. */
  readonly limit: ContextLimit | undefined;
  readonly error: { readonly code?: string; readonly message: string } | undefined;
  readonly onChange: (value: string) => void;
}

const modes = [
  { value: 'auto', label: 'Auto' },
  { value: 'number', label: 'A number of tokens' },
] as const;

// RF-401
export function OllamaContextField(props: OllamaContextFieldProps): JSX.Element {
  const { id, value, scope, limit, error, onChange } = props;
  const isAuto = value === 'auto';
  return (
    <div class="rst-role__fields">
      <Field
        kind="select"
        id={id}
        label="Ollama context size"
        value={isAuto ? 'auto' : 'number'}
        options={modes}
        help={`Auto picks the largest size that fits the GPU memory. ${scope} A number goes from ${CONTEXT_MIN.toLocaleString('en-US')} up to ${contextMax(limit).toLocaleString('en-US')} tokens.`}
        error={isAuto ? error : undefined}
        announce={false}
        onChange={(mode) => {
          onChange(mode === 'auto' ? 'auto' : '');
        }}
      />
      {isAuto ? null : (
        <Field
          kind="text"
          id={`${id}-tokens`}
          label="Ollama context size in tokens"
          placeholder="65536"
          value={value}
          error={error}
          announce={false}
          onInput={onChange}
        />
      )}
    </div>
  );
}

/** The field of the server's refusal on the Default models page. */
export const DEFAULT_CONTEXT_FIELD = 'ollamaContextTokens';

/** The field on the Default models page: its own problem first, then the server's. */
export function DefaultContextField(props: {
  readonly context: ContextDraft;
  readonly failure: ApiFailure | undefined;
  readonly limit: ContextLimit | undefined;
}): JSX.Element {
  const { context, failure, limit } = props;
  return (
    <OllamaContextField
      id="default-ollama-context"
      value={context.text}
      scope="It applies to every Ollama role of a new project."
      limit={limit}
      error={
        context.problem === undefined
          ? problemFor(failure, DEFAULT_CONTEXT_FIELD)
          : { message: context.problem }
      }
      onChange={context.change}
    />
  );
}
