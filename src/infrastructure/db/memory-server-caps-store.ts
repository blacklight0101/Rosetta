import type { AuditEventInput, AuditLog } from '../../application/ports/audit-log.js';
import type { ServerCapsStore } from '../../application/ports/server-caps-store.js';
import type { ServerSettings, SettingChange } from '../../application/ports/server-settings.js';
import type { ServerCaps } from '../../domain/budget/budget.js';

// RF-1106, RF-1109: the caps change and its audit row in memory, for unit tests. The audit row is
// written first, so a failing audit write leaves the caps as they were, as PgServerCapsStore does.

export class MemoryServerCapsStore implements ServerCapsStore {
  private readonly settings: ServerSettings;
  private readonly auditLog: AuditLog;

  constructor(settings: ServerSettings, auditLog: AuditLog) {
    this.settings = settings;
    this.auditLog = auditLog;
  }

  async saveCaps(caps: ServerCaps, change: SettingChange, audit: AuditEventInput): Promise<void> {
    await this.auditLog.record(audit);
    await this.settings.saveCaps(caps, change);
  }
}
