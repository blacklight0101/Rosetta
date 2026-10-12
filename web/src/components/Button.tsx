import type { ComponentChildren, JSX } from 'preact';

// design-system.md section 5: native button; a disabled one keeps its reason in the title (section
// 7, "disabled with a reason"); a busy one cannot be pressed twice.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

export interface ButtonProps {
  readonly children: ComponentChildren;
  readonly variant?: ButtonVariant;
  readonly type?: 'button' | 'submit';
  readonly id?: string;
  /** The accessible name when the visible word repeats in a list ("Disable" for each account). */
  readonly ariaLabel?: string;
  readonly busy?: boolean;
  /** Why the button cannot be used; its presence disables the button. */
  readonly disabledReason?: string;
  readonly onClick?: () => void;
}

// RNF-010
export function Button(props: ButtonProps): JSX.Element {
  const { children, variant = 'secondary', type = 'button', busy = false, onClick } = props;
  const disabled = props.disabledReason !== undefined;
  return (
    <button
      id={props.id}
      class={`rst-button rst-button--${variant}`}
      data-testid="button"
      type={type}
      disabled={disabled || busy}
      aria-label={props.ariaLabel}
      aria-busy={busy ? 'true' : undefined}
      title={props.disabledReason}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
