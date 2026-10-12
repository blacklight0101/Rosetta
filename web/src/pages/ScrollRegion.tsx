import type { ComponentChildren, JSX } from 'preact';

// RNF-010, design-system.md section 8: a table wider than its card scrolls sideways, and a
// scrolling area must be reachable by keyboard, so it is a focusable region with a name.

// RNF-010
export function ScrollRegion(props: {
  readonly label: string;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <div class="rst-table-scroll" role="region" tabIndex={0} aria-label={props.label}>
      {props.children}
    </div>
  );
}
