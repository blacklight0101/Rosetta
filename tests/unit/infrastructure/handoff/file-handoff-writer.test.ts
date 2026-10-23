import { describe, expect, it } from 'vitest';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err, ok, type Result } from '../../../../src/domain/errors/result.js';
import {
  emptyCounts,
  SecretMasker,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileHandoffWriter } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import {
  apiSecret,
  mailSecret,
  smtpSecret,
  syntheticAppSettings,
} from '../../../support/secret-setting-shapes.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-601, RNF-003, data-model.md section 3.17: the package goes through the workspace writer; a
// refused or failed write is RST-1804, and every finished file is masked once more as a whole.

const scope = {
  id: 'run-1',
  userId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f',
  projectId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70',
  runKey: '20261012-100000-plan',
};

const refusal: WriteRefusal = {
  code: ERROR_CODES.workspaceIdInvalid,
  reason: 'outside-workspace',
  message: 'The path leaves the workspace.',
};

/** A writer that keeps what it is given, or answers every write with the given answer. */
class SpyWriter implements OutputWriter {
  readonly files = new Map<string, string>();
  private readonly answer: () => Promise<Result<void, WriteRefusal>>;

  constructor(answer?: () => Promise<Result<void, WriteRefusal>>) {
    this.answer = answer ?? (() => Promise.resolve(ok(undefined)));
  }

  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path, content);
    return this.answer();
  }

  appendLine(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(err(refusal));
  }

  readText(): Promise<Result<string, WriteRefusal>> {
    return Promise.resolve(err(refusal));
  }

  remove(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(err(refusal));
  }
}

/** Masks the package's fixed title, which no piece of model text ever carries. */
const titleMasker: TextMasker = {
  mask: (text) => ({
    text: text.replaceAll('Modernisation hand-off package', '[MASKED:title]'),
    counts: emptyCounts(),
  }),
};

describe('FileHandoffWriter', () => {
  it('RF-601 a refused write rejects with RST-1804', async () => {
    const writer = new SpyWriter(() => Promise.resolve(err(refusal)));
    const handoff = new FileHandoffWriter({ writer, masker: titleMasker });

    await expect(handoff.write(scope, handoffOf('Plain text.'))).rejects.toMatchObject({
      code: ERROR_CODES.handoffWriteFailed,
    });
  });

  it('RF-601 a write that throws rejects with RST-1804', async () => {
    const writer = new SpyWriter(() => Promise.reject(new Error('disk full')));
    const handoff = new FileHandoffWriter({ writer, masker: titleMasker });

    await expect(handoff.write(scope, handoffOf('Plain text.'))).rejects.toMatchObject({
      code: ERROR_CODES.handoffWriteFailed,
    });
  });

  it('RNF-003 masks each finished file as a whole, the fixed text included', async () => {
    const writer = new SpyWriter();

    await new FileHandoffWriter({ writer, masker: titleMasker }).write(scope, handoffOf('Text.'));

    const readme = [...writer.files].find(([path]) => path.endsWith('/handoff/README.md'))?.[1];
    expect(readme).toContain('# [MASKED:title]');
    expect(readme).not.toContain('Modernisation hand-off package');
  });

  it('RF-141 the package holds none of the values of the key/value settings of a web.config', async () => {
    const writer = new SpyWriter();

    await new FileHandoffWriter({ writer, masker: new SecretMasker() }).write(
      scope,
      handoffOf(syntheticAppSettings),
    );

    const written = [...writer.files.values()].join('\n');
    expect(written).toContain('SmtpPassword');
    for (const secret of [smtpSecret, mailSecret, apiSecret]) {
      expect(written).not.toContain(secret);
    }
  });
});
