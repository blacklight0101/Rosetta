import { useState } from 'preact/hooks';

// RF-1021, P8-26, P8-114: a folded section of the project page ("Replace the source", "Start another
// run") that opens by itself when `auto` says so and keeps what the user chose: the same element stays
// in place when `auto` changes, so a section the user opened does not close under them.

export interface Fold {
  readonly open: boolean;
  readonly onToggle: (e: Event) => void;
}

export function useFold(auto: boolean): Fold {
  const [chosen, setChosen] = useState<boolean | undefined>();
  return {
    open: chosen ?? auto,
    onToggle: (event) => {
      if (event.currentTarget instanceof HTMLDetailsElement) setChosen(event.currentTarget.open);
    },
  };
}
