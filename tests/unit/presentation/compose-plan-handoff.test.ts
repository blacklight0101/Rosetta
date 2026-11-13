import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../../src/application/ports/output-writer.js';
import { ok, type Result } from '../../../src/domain/errors/result.js';
import { packageHandoffWriter } from '../../../src/presentation/compose-plan.js';
import { fakeValue } from '../../support/fake-value.js';
import { handoffOf } from '../../support/handoff-package-fixture.js';

// P7-11 (RF-141, ADR-006, DEC-16): the composed package writer masks a secret with the bare marker;
// the note of `prompts/shared/masked-value.v1.md` is meant for the model, not for the package.
// FAKE values only (RNF-003).

const scope = {
  id: 'run-1',
  userId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f',
  projectId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70',
  runKey: '20261029-100000-plan',
};

class KeepingWriter implements OutputWriter {
  readonly files: string[] = [];

  writeText(_file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.files.push(content);
    return Promise.resolve(ok(undefined));
  }

  appendLine(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(ok(undefined));
  }

  readText(): Promise<Result<string, WriteRefusal>> {
    return Promise.resolve(ok(''));
  }

  remove(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(ok(undefined));
  }
}

describe('composePlan: the package writer (P7-11)', () => {
  it('RF-141 DEC-16 masks a secret in model text with the bare marker, not the prompt note', async () => {
    const secret = `Ex${fakeValue(6)}6`;
    const writer = new KeepingWriter();

    await packageHandoffWriter(writer).write(scope, handoffOf(`The password: ${secret} is set.`));

    const all = writer.files.join('\n');
    const note = (await readFile('prompts/shared/masked-value.v1.md', 'utf8'))
      .trim()
      .replace('[MASKED:{{kind}}]', '')
      .trim();
    expect(all).not.toContain(secret);
    expect(all).toContain('[MASKED:password]');
    expect(all).not.toContain(note);
  });
});
