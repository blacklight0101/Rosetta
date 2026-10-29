import type { SourceCard } from './plan-sources.js';

// P7-13 stub: the kind of thing an `ENT` card describes when it describes no stored data.

/** Why the card needs no table (a configuration, a view model, ...); undefined when it describes stored data. */
export function noStoredData(card: SourceCard): string | undefined {
  return card.id === '' ? 'none' : undefined;
}
