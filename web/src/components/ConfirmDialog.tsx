import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Button } from './Button.js';

// RF-1012, design-system.md section 7 (destructive confirmation): a modal dialog that names its
// target and what the action frees and keeps, closes with Esc or Cancel, returns the focus to the
// button that opened it, and repeats the verb on its danger button. It is a native `<dialog>` opened
// with `showModal()`, so the page behind it is inert.

export interface ConfirmDialogProps {
  /** The question, naming the target: `Delete run 2026...?`. It is the dialog's accessible name. */
  readonly title: string;
  /** What is removed, the space freed and what is kept. */
  readonly children: ComponentChildren;
  /** The verb of the danger button, for example `Delete run`. */
  readonly confirmLabel: string;
  /** The deletion is under way: the danger button cannot be pressed again. */
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Opens the dialog as a modal and gives the focus back to what had it when the dialog goes. */
function useModal(): { readonly ref: { current: HTMLDialogElement | null } } {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (dialog !== null && typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return { ref };
}

// RF-1012
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  const { ref } = useModal();
  const titleId = useId();
  const bodyId = useId();
  return (
    <dialog
      ref={ref}
      class="rst-p140-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        props.onCancel();
      }}
    >
      <h2 id={titleId} class="rst-p140-dialog__title">
        {props.title}
      </h2>
      <div id={bodyId} class="rst-p140-dialog__body">
        {props.children}
      </div>
      <div class="rst-p140-dialog__actions">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button variant="danger" busy={props.busy === true} onClick={props.onConfirm}>
          {props.confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
