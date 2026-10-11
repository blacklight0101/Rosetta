import { describe, expect, it } from 'vitest';
import type { Logger } from '../../src/application/ports/logger.js';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import type { Result } from '../../src/domain/errors/result.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../support/fixed-clock.js';
import { MemoryLogger } from '../support/memory-logger.js';
import { securityCodes } from '../support/reader-harness.js';

export type OutputWriterFactory = (logger: Logger) => Promise<OutputWriter>;

interface WriterHarness {
  readonly writer: OutputWriter;
  readonly logger: MemoryLogger;
}

type NewWriter = () => Promise<WriterHarness>;

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const otherUserId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const manifest: WorkspaceFile = { userId, path: 'projects/p/runs/r/manifest.json' };

function refusalOf<T>(result: Result<T, WriteRefusal>): WriteRefusal | undefined {
  return result.ok ? undefined : result.error;
}

function writeTests(newWriter: NewWriter): void {
  it('RF-005 writes a file inside the workspace and reads it back', async () => {
    const { writer } = await newWriter();

    expect(await writer.writeText(manifest, '{"schemaVersion":1}\n')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await writer.readText(manifest)).toEqual({ ok: true, value: '{"schemaVersion":1}\n' });
  });

  it('RF-005 a second write replaces the whole file', async () => {
    const { writer } = await newWriter();
    await writer.writeText(manifest, 'first version, longer\n');
    await writer.writeText(manifest, 'second\n');

    expect(await writer.readText(manifest)).toEqual({ ok: true, value: 'second\n' });
  });

  it('RF-005 appends complete lines to a JSON Lines file', async () => {
    const { writer } = await newWriter();
    const events: WorkspaceFile = { userId, path: 'projects/p/runs/r/events.jsonl' };
    await writer.appendLine(events, '{"n":1}');
    await writer.appendLine(events, '{"n":2}');

    expect(await writer.readText(events)).toEqual({ ok: true, value: '{"n":1}\n{"n":2}\n' });
  });

  it('RF-005 the workspaces of two users are separate', async () => {
    const { writer } = await newWriter();
    await writer.writeText(manifest, 'mine\n');

    expect(refusalOf(await writer.readText({ ...manifest, userId: otherUserId }))).toMatchObject({
      code: ERROR_CODES.fileNotFound,
      reason: 'not-found',
    });
  });
}

function refusalTests(newWriter: NewWriter): void {
  it.each([
    '../9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/x.json',
    'projects/../../x.json',
    '/etc/x',
    'C:/x',
  ])(
    'RF-005 a write to %j outside the workspace fails with an error code and a security event',
    async (path) => {
      const { writer, logger } = await newWriter();
      const refusal = refusalOf(await writer.writeText({ userId, path }, 'x'));

      expect(refusal).toMatchObject({
        code: ERROR_CODES.writeOutsideWorkspace,
        reason: 'outside-workspace',
      });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.writeOutsideWorkspace]);
    },
  );

  it.each(['../sources', '..', 'not-a-uuid', ''])(
    'RF-005 a write for the user id %j is refused, so no path is built from request text',
    async (badUserId) => {
      const { writer, logger } = await newWriter();
      const refusal = refusalOf(
        await writer.appendLine({ userId: badUserId, path: 'x.jsonl' }, '{}'),
      );

      expect(refusal).toMatchObject({
        code: ERROR_CODES.writeOutsideWorkspace,
        reason: 'outside-workspace',
      });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.writeOutsideWorkspace]);
    },
  );
}

function invalidPathTests(newWriter: NewWriter): void {
  it.each(['NUL', 'runs/con.json', 'x.json:stream', 'x.json.', `${'n'.repeat(300)}.json`])(
    'RF-005 a write to the invalid path %j is refused with a security event',
    async (path) => {
      const { writer, logger } = await newWriter();
      const refusal = refusalOf(await writer.writeText({ userId, path }, 'x'));

      expect(refusal).toMatchObject({ code: ERROR_CODES.pathInvalid, reason: 'invalid-path' });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.pathInvalid]);
    },
  );

  it('RF-005 a read outside the workspace is refused the same way', async () => {
    const { writer } = await newWriter();

    expect(refusalOf(await writer.readText({ userId, path: '../x' }))).toMatchObject({
      reason: 'outside-workspace',
    });
  });
}

/** Contract of the OutputWriter port (RF-005). */
export function outputWriterContract(name: string, create: OutputWriterFactory): void {
  describe(`OutputWriter contract: ${name}`, () => {
    const newWriter: NewWriter = async () => {
      const logger = new MemoryLogger(
        new FixedClock('2026-10-11T09:00:00.000Z'),
        new SecretMasker(),
      );
      return { writer: await create(logger), logger };
    };

    writeTests(newWriter);
    refusalTests(newWriter);
    invalidPathTests(newWriter);
  });
}
