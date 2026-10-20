import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';

// design-system.md sections 5 and 8, RF-1015: the tab pattern. A list of tabs, one selected, and one
// panel showing at a time. Left and Right move to the next tab and select it, Home and End go to the
// first and the last; only the selected tab is in the tab order. Only the selected panel draws its
// content, so a long list on a tab that is not open costs nothing.

export interface TabSpec {
  readonly id: string;
  readonly label: string;
  /** A number beside the label, for example how many cards there are, or "1,000+" for "more". */
  readonly count?: number | string | undefined;
}

export interface TabsProps {
  /** The name of the tab list. */
  readonly label: string;
  readonly tabs: readonly TabSpec[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  /** The content of the selected tab. */
  readonly children: ComponentChildren;
}

function targetOf(key: string, index: number, last: number): number | undefined {
  if (key === 'ArrowRight') return index === last ? 0 : index + 1;
  if (key === 'ArrowLeft') return index === 0 ? last : index - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return undefined;
}

function Panel(props: {
  readonly id: string;
  readonly labelledBy: string;
  readonly open: boolean;
  readonly children: ComponentChildren;
}): JSX.Element {
  return (
    <div
      role="tabpanel"
      id={props.id}
      class="rst-tabs__panel"
      aria-labelledby={props.labelledBy}
      tabIndex={props.open ? 0 : undefined}
      hidden={!props.open}
    >
      {props.open ? props.children : null}
    </div>
  );
}

// RF-1015
export function Tabs(props: TabsProps): JSX.Element {
  const base = useId();
  const tabId = (id: string): string => `${base}-tab-${id}`;
  const panelId = (id: string): string => `${base}-panel-${id}`;
  const move = (event: KeyboardEvent, index: number): void => {
    const target = targetOf(event.key, index, props.tabs.length - 1);
    const next = target === undefined ? undefined : props.tabs[target];
    if (next === undefined) return;
    event.preventDefault();
    props.onSelect(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };
  return (
    <div class="rst-tabs">
      <div class="rst-tabs__list" role="tablist" aria-label={props.label}>
        {props.tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            class="rst-tabs__tab"
            aria-selected={tab.id === props.selected}
            aria-controls={panelId(tab.id)}
            tabIndex={tab.id === props.selected ? 0 : -1}
            onClick={() => {
              props.onSelect(tab.id);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
          >
            {tab.label}
            {tab.count === undefined ? null : <span class="rst-tabs__count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {props.tabs.map((tab) => (
        <Panel
          key={tab.id}
          id={panelId(tab.id)}
          labelledBy={tabId(tab.id)}
          open={tab.id === props.selected}
        >
          {props.children}
        </Panel>
      ))}
    </div>
  );
}
