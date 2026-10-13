import type { LogLevel, LogRow } from '../../api/call-schemas.js';

// RF-1011, DEC-57: the level filter and the security filter of the "Logs" panel.

export type LevelChoice = Readonly<Record<LogLevel, boolean>>;

/** The levels the panel starts with: everything but debug. */
export const defaultLevels: LevelChoice = { debug: false, info: true, warn: true, error: true };

/** Security events are the entries of the logger `security` (data-model.md section 3.14). */
const isSecurityEvent = (entry: Pick<LogRow, 'logger'>): boolean => entry.logger === 'security';

// RF-1011
export function visibleLogs(
  entries: readonly LogRow[],
  levels: LevelChoice,
  securityOnly: boolean,
): readonly LogRow[] {
  return entries.filter((entry) => (securityOnly ? isSecurityEvent(entry) : levels[entry.level]));
}
