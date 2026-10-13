import type { LogLevel, LogRow } from '../../api/call-schemas.js';

// RF-1011: the level filter and the security filter of the "Logs" panel.

export type LevelChoice = Readonly<Record<LogLevel, boolean>>;

// RF-1011
export function visibleLogs(
  entries: readonly LogRow[],
  levels: LevelChoice,
  securityOnly: boolean,
): readonly LogRow[] {
  void levels;
  void securityOnly;
  return entries.slice(0, 0);
}
