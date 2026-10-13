import { describe, expect, it } from 'vitest';
import { entryBelongsToRun } from '../../../../src/domain/observability/log-scope.js';

// RF-1011, RF-1105: an application log entry is shown on a run's page only when it can be told to be
// that run's. A run's key is unique per project only, and a deleted run leaves its entries in the log,
// so an entry that names the key belongs to the run only when it also names the owner; an entry with
// the key and no user is never shown.

const run = {
  id: '11111111-1111-4111-8111-111111111111',
  runKey: '20261011-091204-understand',
  userId: 'user-amy',
};

describe('entryBelongsToRun', () => {
  it('RF-1011 accepts an entry with the run key and the owner', () => {
    expect(entryBelongsToRun({ runId: run.runKey, userId: 'user-amy' }, run)).toBe(true);
  });

  it('RF-1105 refuses an entry with the run key and another user', () => {
    expect(entryBelongsToRun({ runId: run.runKey, userId: 'user-bob' }, run)).toBe(false);
  });

  it('RF-1105 refuses an entry with the run key and no user, which may be a deleted run of another user', () => {
    expect(entryBelongsToRun({ runId: run.runKey }, run)).toBe(false);
  });

  it('RF-1011 accepts an entry with the run UUID and no user, and one with the UUID and the owner', () => {
    expect(entryBelongsToRun({ runId: run.id }, run)).toBe(true);
    expect(entryBelongsToRun({ runId: run.id, userId: 'user-amy' }, run)).toBe(true);
  });

  it('RF-1105 refuses an entry with the run UUID and another user', () => {
    expect(entryBelongsToRun({ runId: run.id, userId: 'user-bob' }, run)).toBe(false);
  });

  it('RF-1105 refuses an entry that names no run, and one that names another run', () => {
    expect(entryBelongsToRun({}, run)).toBe(false);
    expect(entryBelongsToRun({ userId: 'user-amy' }, run)).toBe(false);
    expect(entryBelongsToRun({ runId: '20261011-091204-scan', userId: 'user-amy' }, run)).toBe(
      false,
    );
  });
});
