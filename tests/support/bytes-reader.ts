import type { RepositoryReader } from '../../src/application/ports/repository-reader.js';
import { err, ok } from '../../src/domain/errors/result.js';

/** The part of `RepositoryReader` the pack runner uses, over an in-memory snapshot. */
export function bytesReader(
  files: Readonly<Record<string, string>>,
): Pick<RepositoryReader, 'readBytes'> {
  return {
    readBytes: ({ path, maxBytes }) => {
      const text = files[path];
      if (text === undefined) {
        return Promise.resolve(
          err({ code: 'RST-1104', reason: 'not-found', message: 'No such file.' }),
        );
      }
      const bytes = new TextEncoder().encode(text);
      return Promise.resolve(
        ok({ path, sizeBytes: bytes.length, bytes: bytes.length > maxBytes ? undefined : bytes }),
      );
    },
  };
}
