import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { failureOf } from '../../../support/failure-of.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-605, RNF-003, data-model.md section 3.20: planning-brief.json in the project folder.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/planning-brief.json`;
const brief = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T10:00:00.000Z' };

function setup() {
  const writer = new MemoryOutputWriter();
  return { writer, store: new FilePlanningBriefStore({ writer, masker: new SecretMasker() }) };
}

describe('FilePlanningBriefStore: writing', () => {
  it('RF-605 a project without a file has no brief', async () => {
    expect(await setup().store.read(project)).toBeUndefined();
  });

  it('RF-605 a written brief reads back equal, from planning-brief.json in the project folder', async () => {
    const { writer, store } = setup();

    await store.write(project, brief);

    expect([...writer.files.keys()]).toEqual([path]);
    expect(await store.read(project)).toEqual(brief);
    expect(writer.files.get(path)?.endsWith('}\n')).toBe(true);
  });

  it('RF-605 a second write replaces the first', async () => {
    const { store } = setup();
    await store.write(project, brief);

    await store.write(project, { ...brief, migration: 'rewrite' });

    expect((await store.read(project))?.migration).toBe('rewrite');
  });

  it('RNF-003 a secret typed into a free-text answer is masked in the file', async () => {
    const { writer, store } = setup();
    const secret = 'sk-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const withSecret = {
      ...brief,
      context: { ...brief.context, experience: `uses key ${secret} daily` },
    };

    await store.write(project, withSecret);

    expect(writer.files.get(path)).not.toContain(secret);
    expect(writer.files.get(path)).toContain('[MASKED');
  });
});

describe('FilePlanningBriefStore: refusals', () => {
  it('RF-605 a file that is not JSON is an error, not a guess', async () => {
    const { writer, store } = setup();
    writer.files.set(path, '{ not json');

    const error = await failureOf(store.read(project));

    expect(error).toBeInstanceOf(RosettaError);
    expect(error).toMatchObject({ code: ERROR_CODES.unexpected });
  });

  it('RF-605 a file that is not a version 1 brief is an error, not a guess', async () => {
    const { writer, store } = setup();
    writer.files.set(path, JSON.stringify({ ...brief, schemaVersion: 2 }));

    expect(await failureOf(store.read(project))).toMatchObject({ code: ERROR_CODES.unexpected });
  });

  it('RF-605 a write the workspace refuses is rejected with the writer code', async () => {
    const { writer, store } = setup();
    writer.writeText = () =>
      Promise.resolve({
        ok: false,
        error: { code: ERROR_CODES.pathOutsideRoot, reason: 'outside-workspace', message: 'no' },
      });

    expect(await failureOf(store.write(project, brief))).toMatchObject({
      code: ERROR_CODES.pathOutsideRoot,
    });
  });

  it('RF-605 a read the workspace refuses is rejected, not taken for a missing file', async () => {
    const { writer, store } = setup();
    writer.readText = () =>
      Promise.resolve({
        ok: false,
        error: { code: ERROR_CODES.pathOutsideRoot, reason: 'outside-workspace', message: 'no' },
      });

    expect(await failureOf(store.read(project))).toMatchObject({ code: ERROR_CODES.unexpected });
  });
});
