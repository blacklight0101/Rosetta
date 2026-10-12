import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../../web/src/components/Button';
import { EmptyState } from '../../../web/src/components/EmptyState';
import { ErrorBanner } from '../../../web/src/components/ErrorBanner';
import { Field } from '../../../web/src/components/Field';

// design-system.md sections 5, 7 and 8: buttons, fields with error text, the error banner with
// code and next step, the empty state.

describe('RNF-010 Button', () => {
  it('RNF-010 is a native button that runs its action when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start run</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger', 'danger-outline'] as const)(
    'RNF-010 renders the %s variant as a class of the component',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button').className).toContain(`rst-button--${variant}`);
    },
  );

  it('RNF-010 keeps the reason of a disabled button in its title and does not act', () => {
    const onClick = vi.fn();
    render(
      <Button disabledReason="The run is in use" onClick={onClick}>
        Delete
      </Button>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button');
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('The run is in use');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('RNF-010 cannot be pressed twice while busy', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Start run
      </Button>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('RNF-010 Field', () => {
  it('RNF-010 binds the label to the input', () => {
    render(<Field kind="text" id="user" label="User name" value="" onInput={() => undefined} />);
    expect(screen.getByLabelText('User name').tagName).toBe('INPUT');
  });

  it('RNF-008 shows the error code and message and links them to the invalid input', () => {
    render(
      <Field
        kind="url"
        id="repo"
        label="GitHub repository URL"
        value="https://github.com/o/private"
        onInput={() => undefined}
        help="A public repository."
        error={{ code: 'RST-1903', message: 'This repository is private or does not exist.' }}
      />,
    );
    const input = screen.getByLabelText('GitHub repository URL');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const error = screen.getByTestId('field-error');
    expect(describedBy).toContain(error.id);
    expect(describedBy).toContain(screen.getByTestId('field-help').id);
    expect(error.textContent).toBe('RST-1903 · This repository is private or does not exist.');
  });

  it('RNF-010 reports typing through onInput with the new value', () => {
    const onInput = vi.fn();
    render(<Field kind="text" id="n" label="Name" value="" onInput={onInput} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ana' } });
    expect(onInput).toHaveBeenCalledWith('Ana');
  });

  it('RNF-010 renders a select, a checkbox and a radio group with their labels', () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    render(
      <div>
        <Field
          kind="select"
          id="s"
          label="Provider"
          value="a"
          options={options}
          onChange={vi.fn()}
        />
        <Field kind="checkbox" id="c" label="I agree" checked={false} onChange={vi.fn()} />
        <Field kind="radio" id="r" label="Stage" value="b" options={options} onChange={vi.fn()} />
      </div>,
    );
    expect(screen.getByLabelText('Provider').tagName).toBe('SELECT');
    expect(screen.getByLabelText<HTMLInputElement>('I agree').type).toBe('checkbox');
    expect(screen.getByRole('radiogroup', { name: 'Stage' })).not.toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Beta').checked).toBe(true);
  });

  it('RNF-010 reports a checkbox and a radio choice', () => {
    const onChange = vi.fn();
    render(<Field kind="checkbox" id="c" label="I agree" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('I agree'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('RNF-008 ErrorBanner', () => {
  const error = {
    code: 'RST-2004',
    message: 'That already exists.',
    nextStep: 'Open the existing project instead.',
  };

  it('RNF-008 shows the code, what happened and what to do, as an alert', () => {
    render(<ErrorBanner error={error} />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('RST-2004');
    expect(banner.textContent).toContain('That already exists.');
    expect(banner.textContent).toContain('Open the existing project instead.');
  });

  it('RNF-008 lists the field problems with their own codes', () => {
    render(
      <ErrorBanner
        error={{
          ...error,
          problems: [
            { field: 'caps.run', code: 'RST-1601', message: 'Too low.', nextStep: 'Raise it.' },
          ],
        }}
      />,
    );
    const problems = screen.getByTestId('error-banner-problems');
    expect(problems.textContent).toContain('caps.run');
    expect(problems.textContent).toContain('RST-1601');
  });
});

describe('RNF-010 EmptyState', () => {
  it('RNF-010 says one sentence and offers the next action', () => {
    render(
      <EmptyState message="No runs yet.">
        <Button>Start a run</Button>
      </EmptyState>,
    );
    expect(screen.getByTestId('empty-state').textContent).toContain('No runs yet.');
    expect(screen.getByRole('button', { name: 'Start a run' })).not.toBeNull();
  });
});
