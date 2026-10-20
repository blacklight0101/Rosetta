import { directoryProblem } from './compound-directory.js';
import { MAX_DIRECTORY_ENTRIES } from './macro-limits.js';
import { fatSectors, layoutOf, tableOf, tableProblem } from './compound-table.js';

// RF-154, ADR-023: a compound file is checked here before `cfb` reads it. `cfb` follows every sector
// chain without remembering where it has been, copies each chain it meets and arranges the
// directory in quadratic time, so a file made to loop, merge chains or share sectors between
// streams makes it use memory or time without end. The header, the allocation table
// (compound-table) and the directory (compound-directory) are walked here with every sector and entry
// marked; the reason a file is refused comes back as text and `cfb` never sees the file.

/** Why `bytes` must not be given to `cfb`, or undefined when it may be. */
export function compoundFileProblem(
  bytes: Uint8Array,
  maxEntries = MAX_DIRECTORY_ENTRIES,
): string | undefined {
  const layout = layoutOf(bytes);
  if (typeof layout === 'string') return layout;
  const ids = fatSectors(layout);
  if (typeof ids === 'string') return ids;
  const table = tableOf(layout, ids);
  if (typeof table === 'string') return table;
  const directory = layout.view.getInt32(0x30, true);
  if (directory < 0 || directory >= layout.sectors)
    return 'the directory sector is outside the file';
  return tableProblem(layout, table) ?? directoryProblem(layout, table, bytes.length, maxEntries);
}
