import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../../web/src/components/ConfirmDialog.js';

// RF-1012, design-system.md section 7: the confirmation of a destructive action is a modal dialog
// that names its target, closes with Esc or Cancel, returns the focus to the button that opened it
// and repeats the verb on its danger button.

function Opener(props: { readonly onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      {open ? (
        <ConfirmDialog
          title="Delete run 20261009-184012-understand?"
          confirmLabel="Delete run"
          onConfirm={props.onConfirm}
          onCancel={() => {
            setOpen(false);
          }}
        >
          <p>This removes the run folder.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

describe('ConfirmDialog', () => {
  it('RF-1012 is a modal dialog named by its title and described by its body', () => {
    render(<Opener onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete run 20261009-184012-understand?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const described = dialog.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)?.textContent).toContain(
      'This removes the run folder.',
    );
    expect(screen.getByRole('button', { name: 'Delete run' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull();
  });

  it('RF-1012 confirms only when the danger button is pressed', () => {
    const onConfirm = vi.fn();
    render(<Opener onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete run' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog closing', () => {
  it('RF-1012 closes on Cancel and on Esc without confirming, and gives the focus back', () => {
    const onConfirm = vi.fn();
    render(<Opener onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('RF-1012 cannot be confirmed twice while the deletion is in progress', () => {
    render(
      <ConfirmDialog
        title="Delete?"
        confirmLabel="Delete run"
        busy
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <p>Body.</p>
      </ConfirmDialog>,
    );

    const confirm = screen.getByRole('button', { name: 'Delete run' });

    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(confirm.getAttribute('aria-busy')).toBe('true');
  });
});
