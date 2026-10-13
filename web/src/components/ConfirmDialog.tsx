import type { ComponentChildren, JSX } from 'preact';

// RF-1012: stub, replaced by the implementation.

export interface ConfirmDialogProps {
  readonly title: string;
  readonly children: ComponentChildren;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  return <div data-busy={props.busy === true ? 'yes' : 'no'} />;
}
