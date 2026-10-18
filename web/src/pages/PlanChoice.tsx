import type { ComponentChildren, JSX } from 'preact';

// RF-605, design-system.md section 14 (Plan setup): one radio option as a card, with the title as
// its label and the trade-offs, the evidence and the reason beside it as its description.

export interface PlanChoiceProps {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly checked: boolean;
  readonly onChoose: () => void;
  readonly children?: ComponentChildren;
}

// RF-605
export function PlanChoice(props: PlanChoiceProps): JSX.Element {
  const { id, group, title, checked, onChoose, children } = props;
  return (
    <div class={`rst-plan-opt${checked ? ' rst-plan-opt--selected' : ''}`}>
      <input
        id={id}
        type="radio"
        name={group}
        checked={checked}
        aria-describedby={children === undefined ? undefined : `${id}-more`}
        onChange={onChoose}
      />
      <div class="rst-plan-opt__body">
        <label for={id} class="rst-plan-opt__title">
          {title}
        </label>
        {children === undefined ? null : <div id={`${id}-more`}>{children}</div>}
      </div>
    </div>
  );
}
