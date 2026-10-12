import { fireEvent, render, screen } from '@testing-library/preact';
import { expect, it, vi } from 'vitest';
import { Field } from '../../../web/src/components/Field.js';

// RNF-008, RNF-010, design-system.md section 5: the number and textarea kinds of the Field, and
// the way a field whose error is read through the focused control stays out of the live regions.

it('RNF-010 a number field is a labelled number input that reports what was typed', () => {
  const onInput = vi.fn<(value: string) => void>();
  render(<Field kind="number" id="tokens" label="Run token cap" value="5" onInput={onInput} />);

  const input = screen.getByLabelText('Run token cap');
  fireEvent.input(input, { target: { value: '12' } });

  expect(input.getAttribute('type')).toBe('number');
  expect(onInput).toHaveBeenCalledWith('12');
});

it('RNF-010 a textarea field is a labelled multi-line control that reports what was typed', () => {
  const onInput = vi.fn<(value: string) => void>();
  render(<Field kind="textarea" id="rules" label="Ignore rules" value="a/\nb/" onInput={onInput} />);

  const area = screen.getByLabelText('Ignore rules');
  fireEvent.input(area, { target: { value: 'c/' } });

  expect(area.tagName).toBe('TEXTAREA');
  expect(onInput).toHaveBeenCalledWith('c/');
});

it('RNF-010 an error that is read through the focused control is not also a live region', () => {
  render(
    <Field
      kind="number"
      id="tokens"
      label="Run token cap"
      value="-1"
      announce={false}
      error={{ code: 'RST-1003', message: 'A cap is below zero.' }}
      onInput={() => undefined}
    />,
  );

  const input = screen.getByLabelText('Run token cap');
  expect(screen.queryAllByRole('alert')).toEqual([]);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
    'RST-1003 · A cap is below zero.',
  );
});

it('RNF-010 an error is a live region unless the field says the control reads it', () => {
  render(
    <Field
      kind="text"
      id="name"
      label="Name"
      value=""
      error={{ message: 'Enter a name.' }}
      onInput={() => undefined}
    />,
  );

  expect(screen.getByRole('alert').textContent).toBe('Enter a name.');
});
