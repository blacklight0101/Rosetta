import type { JSX } from 'preact';
import { badgeSpecs, type BadgeSpec, type StateListName, type StateValue } from './badge-specs.js';
import { Glyph } from './Glyph.js';

// design-system.md section 5 and 6: one component for every state list. The glyph is hidden from
// assistive technology; the word is the label.

export type BadgeChoice = {
  [L in StateListName]: { readonly list: L; readonly value: StateValue<L> };
}[StateListName];

export type StatusBadgeProps = BadgeChoice & {
  /** Shown before the word, for example the HTTP status of a provider call. */
  readonly detail?: string;
};

function specOf(choice: BadgeChoice): BadgeSpec {
  const table: Readonly<Record<string, BadgeSpec>> = badgeSpecs[choice.list];
  return table[choice.value] ?? { label: choice.value, tone: 'neutral', weight: 'tint' };
}

// RNF-010
export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const { label, tone, weight, glyph } = specOf(props);
  return (
    <span
      class={`rst-badge rst-badge--${tone}-${weight}`}
      data-testid="status-badge"
      data-tone={tone}
      data-weight={weight}
    >
      {glyph === undefined ? null : <Glyph name={glyph} />}
      {props.detail === undefined ? label : `${props.detail} ${label}`}
    </span>
  );
}
