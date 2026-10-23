import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { expect, it, vi } from 'vitest';
import { ModelChoice } from '../../../web/src/pages/ModelChoice.js';
import type { ModelListState } from '../../../web/src/pages/model-lists.js';

// RF-405, RF-427, DEC-156: the dropdown of a role's model. A listed model is chosen from a select
// that marks a model without a price and ends with "Other model...", which shows a text field; a
// saved model that is not listed stays selected there. Without a list (or when Ollama cannot be
// asked) the plain text field stays, with a note, so saving still works.

const anthropic: ModelListState = {
  status: 'ready',
  reason: undefined,
  models: [
    { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', priced: false },
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
  ],
};

function Harness(props: {
  readonly list: ModelListState | undefined;
  readonly initial?: string;
  readonly disabled?: boolean;
  readonly needsTools?: boolean;
  readonly error?: { readonly code?: string; readonly message: string };
  readonly onChange?: (model: string) => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <ModelChoice
      id="reader-model"
      label="Reader model"
      value={value}
      list={props.list}
      disabled={props.disabled === true}
      needsTools={props.needsTools === true}
      error={props.error}
      onChange={(model) => {
        setValue(model);
        props.onChange?.(model);
      }}
    />
  );
}

function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

const optionTexts = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((option) => option.textContent);

it('RF-405 shows a select of the listed models, a model without a price marked, and Other model... last', () => {
  render(<Harness list={anthropic} />);

  expect(optionTexts(selectOf('Reader model'))).toEqual([
    'Choose a model',
    'Claude Opus 5.5 (no price)',
    'GPT-5 nano',
    'Other model...',
  ]);
  expect(selectOf('Reader model').value).toBe('');
});

it('RF-405 choosing a listed model reports its id and shows no text field', () => {
  const onChange = vi.fn<(model: string) => void>();
  render(<Harness list={anthropic} onChange={onChange} />);

  fireEvent.change(selectOf('Reader model'), { target: { value: 'gpt-5-nano' } });

  expect(onChange).toHaveBeenCalledWith('gpt-5-nano');
  expect(selectOf('Reader model').value).toBe('gpt-5-nano');
  expect(screen.queryByLabelText('Reader other model')).toBeNull();
});

it('RF-405 choosing Other model... shows the text field, moves focus to it and saves what is typed', () => {
  const onChange = vi.fn<(model: string) => void>();
  render(<Harness list={anthropic} initial="gpt-5-nano" onChange={onChange} />);

  fireEvent.change(selectOf('Reader model'), { target: { value: '__other__' } });
  const text = screen.getByLabelText<HTMLInputElement>('Reader other model');
  fireEvent.input(text, { target: { value: 'claude-experimental-9' } });

  expect(selectOf('Reader model').value).toBe('__other__');
  expect(document.activeElement).toBe(text);
  expect(onChange).toHaveBeenNthCalledWith(1, '');
  expect(onChange).toHaveBeenLastCalledWith('claude-experimental-9');
});

it('RF-405 a saved model that is not listed stays selected under Other model... with its id in the text field', () => {
  render(<Harness list={anthropic} initial="claude-haiku-4-5" />);

  expect(selectOf('Reader model').value).toBe('__other__');
  expect(screen.getByLabelText<HTMLInputElement>('Reader other model').value).toBe(
    'claude-haiku-4-5',
  );
});

it('RF-405 a saved model that is listed is selected and shows no text field', () => {
  render(<Harness list={anthropic} initial="claude-opus-5-5" />);

  expect(selectOf('Reader model').value).toBe('claude-opus-5-5');
  expect(screen.queryByLabelText('Reader other model')).toBeNull();
});

it('RF-427 a listed model without a price says so under the select', () => {
  render(<Harness list={anthropic} initial="claude-opus-5-5" />);
  const described = (selectOf('Reader model').getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

  expect(described).toContain('no price');
});

it('RF-405 a listed model with a price shows no price note', () => {
  render(<Harness list={anthropic} initial="gpt-5-nano" />);

  expect(selectOf('Reader model').getAttribute('aria-describedby')).toBeNull();
});

it('RF-405 an error shows on the select while none is chosen', () => {
  render(<Harness list={anthropic} error={{ code: 'RST-1002', message: 'Enter the model.' }} />);

  expect(selectOf('Reader model').getAttribute('aria-invalid')).toBe('true');
  expect(screen.queryByLabelText('Reader other model')).toBeNull();
});

it('RF-405 an error shows on the text field, not the select, under Other model...', () => {
  const error = { code: 'RST-1002', message: 'Enter the model.' };
  render(<Harness list={anthropic} initial="saved-unlisted" error={error} />);

  expect(screen.getByLabelText('Reader other model').getAttribute('aria-invalid')).toBe('true');
  expect(selectOf('Reader model').getAttribute('aria-invalid')).toBeNull();
});

it('RF-405 Ollama with no models and a reason shows the text field and the reason as a note', () => {
  const list: ModelListState = {
    status: 'ready',
    models: [],
    reason: 'Ollama could not be reached.',
  };
  const onChange = vi.fn<(model: string) => void>();
  render(<Harness list={list} onChange={onChange} />);

  fireEvent.input(screen.getByLabelText('Reader model'), { target: { value: 'gemma4:e4b' } });

  expect(screen.getByLabelText('Reader model').tagName).toBe('INPUT');
  expect(screen.getByText(/Ollama could not be reached\./u).textContent).toContain(
    'Type the model id',
  );
  expect(onChange).toHaveBeenCalledWith('gemma4:e4b');
});

it('RF-405 a server with no installed models and no reason says so and keeps the text field', () => {
  render(<Harness list={{ status: 'ready', models: [], reason: undefined }} />);

  expect(screen.getByLabelText('Reader model').tagName).toBe('INPUT');
  expect(screen.getByText(/No models are listed/u)).not.toBeNull();
});

it('RF-405 a list that could not be loaded falls back to the text field with a note', () => {
  render(<Harness list={{ status: 'failed' }} />);

  expect(screen.getByLabelText('Reader model').tagName).toBe('INPUT');
  expect(screen.getByText(/could not be loaded/u)).not.toBeNull();
});

it('RF-405 while the list loads the text field is shown without a note', () => {
  render(<Harness list={{ status: 'loading' }} initial="gemma4:e4b" />);

  expect(screen.getByLabelText<HTMLInputElement>('Reader model').value).toBe('gemma4:e4b');
  expect(screen.queryByText(/could not be loaded|No models are listed/u)).toBeNull();
});

it('RF-405 a provider with no list keeps the plain text field and no note', () => {
  render(<Harness list={undefined} initial="my-model" />);

  expect(screen.getByLabelText<HTMLInputElement>('Reader model').value).toBe('my-model');
  expect(document.querySelector('.rst-field__help')).toBeNull();
});

it('RF-405 a disabled choice (no provider chosen) is a disabled text field', () => {
  render(<Harness list={anthropic} disabled />);

  expect(screen.getByLabelText<HTMLInputElement>('Reader model').disabled).toBe(true);
  expect(screen.getByLabelText('Reader model').tagName).toBe('INPUT');
});

it('RF-405 the select can be driven from the keyboard: it is a native select with a label', () => {
  render(<Harness list={anthropic} />);

  const select = selectOf('Reader model');

  expect(select.tabIndex).toBe(0);
  expect(select.labels[0]?.textContent).toBe('Reader model');
});

const astra: ModelListState = {
  status: 'ready',
  reason: undefined,
  models: [
    { model: 'gpt-6-astra', label: 'GPT-6 astra', priced: true, noTools: true },
    { model: 'gpt-6-luna', label: 'GPT-6 luna', priced: true },
  ],
};

it('P3-130 a model that cannot call tools, picked for a role that calls them, says so naming the model', () => {
  render(<Harness list={astra} initial="gpt-6-astra" needsTools />);

  expect(screen.getByText(/gpt-6-astra cannot call tools/u)).toBeTruthy();
});

it('P3-130 the same model for a role without tools, and a model that can call tools, show no such note', () => {
  const { unmount } = render(<Harness list={astra} initial="gpt-6-astra" />);
  expect(screen.queryByText(/cannot call tools/u)).toBeNull();
  unmount();

  render(<Harness list={astra} initial="gpt-6-luna" needsTools />);
  expect(screen.queryByText(/cannot call tools/u)).toBeNull();
});
