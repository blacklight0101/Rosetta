import type { ComponentChildren, JSX } from 'preact';

// design-system.md section 7: an empty state is one sentence and the next action.

export interface EmptyStateProps {
  readonly message: string;
  /** The next action, usually a Button or a link. */
  readonly children?: ComponentChildren;
}

// RNF-010
export function EmptyState({ message, children }: EmptyStateProps): JSX.Element {
  return (
    <section class="rst-empty-state" data-testid="empty-state">
      <p class="rst-empty-state__message">{message}</p>
      {children}
    </section>
  );
}
