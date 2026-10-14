import type { ServerCaps } from '../../domain/budget/budget.js';
import type { AuditEventInput } from './audit-log.js';
import type { SettingChange } from './server-settings.js';

// RF-1106, RF-1109, DEC-107: a caps change and its audit row are written as one step, both or
// neither, so a saved change always has its audit row and an audit row never describes a change
// that did not happen.
export interface ServerCapsStore {
  saveCaps(caps: ServerCaps, change: SettingChange, audit: AuditEventInput): Promise<void>;
}
