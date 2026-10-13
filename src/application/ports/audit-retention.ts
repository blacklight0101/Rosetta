// RF-1109, DEC-132: audit rows are kept for 365 days. The server role cannot delete audit rows
// itself (data-model.md section 6); the deletion goes through one database function that refuses
// any cut-off younger than 365 days, measured on the database clock.
export interface AuditRetention {
  /**
   * Deletes the audit rows older than `cutOff` and returns how many it deleted. Rejects with the
   * database error code when the store refuses the cut-off (younger than 365 days on its own
   * clock) or fails.
   */
  purgeBefore(cutOff: Date): Promise<number>;
}
