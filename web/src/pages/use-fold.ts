import { useRef, useState } from 'preact/hooks';

// RF-1021, P8-26, P8-114: a folded section of the project page ("Replace the source", "Start another
// run") that opens by itself when `auto` says so and keeps what the user chose: the same element stays
// in place when `auto` changes, so a section the user opened does not close under them.

export interface Fold {
  readonly open: boolean;
  readonly onToggle: (e: Event) => void;
}

export function useFold(auto: boolean): Fold {
  const [chosen, setChosen] = useState<boolean | undefined>();
  const open = chosen ?? auto;
  // The state the page renders, set before the DOM is touched: a `toggle` the page's own change of
  // `open` causes may fire while the new state is being applied (P8-114).
  const rendered = useRef(open);
  rendered.current = open;
  return {
    open,
    // The browser fires `toggle` for the page's own change of `open` too. That event shows the state the
    // page rendered; only an element that differs from it was flipped by the user.
    onToggle: (event) => {
      const { currentTarget } = event;
      if (currentTarget instanceof HTMLDetailsElement && currentTarget.open !== rendered.current) {
        setChosen(currentTarget.open);
      }
    },
  };
}
