import { describe, expect, it } from 'vitest';
import { entryBelongsToRun } from '../../../../src/domain/observability/log-scope.js';

// RF-1011, RF-1105: an application log entry is shown on a run's page only when it can be told to be
// that run's. A run's key is unique per project only, so an entry that names the key and no user
// belongs to the run only while no other user has a run with that key.

const run = {
  id: '11111111-1111-4111-8111-111111111111',
  runKey: '20261011-091204-understand',
  userId: 'user-amy',
};

describe('entryBelongsToRun', () => {
  it('RF-1011 accepts an entry with the run key and the owner', () => {
    expect(entryBelongsToRun({ runId: run.runKey, userId: 'user-amy' }, run, false)).toBe(true);
  });

  it('RF-1105 refuses an entry with the run key and another user', () => {
    expect(entryBelongsToRun({ runId: run.runKey, userId: 'user-bob' }, run, false)).toBe(false);
  });

  it('RF-1011 accepts an entry with the run key and no user while no other user has that key', () => {
    expect(entryBelongsToRun({ runId: run.runKey }, run, false)).toBe(true);
  });

  it('RF-1105 refuses an entry with the run key and no user once another user has that key', () => {
    expect(entryBelongsToRun({ runId: run.runKey }, run, true)).toBe(false);
  });

  it('RF-1011 accepts an entry with the run UUID and no user, whoever shares the key', () => {
    expect(entryBelongsToRun({ runId: run.id }, run, true)).toBe(true);
  });

  it('RF-1105 refuses an entry with the run UUID and another user', () => {
    expect(entryBelongsToRun({ runId: run.id, userId: 'user-bob' }, run, false)).toBe(false);
  });

  it('RF-1105 refuses an entry that names no run, and one that names another run', () => {
    expect(entryBelongsToRun({}, run, false)).toBe(false);
    expect(entryBelongsToRun({ userId: 'user-amy' }, run, false)).toBe(false);
    expect(
      entryBelongsToRun({ runId: '20261011-091204-scan', userId: 'user-amy' }, run, false),
    ).toBe(false);
  });
});
