import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { RunManifestStore } from '../../application/ports/run-manifest-store.js';
import { parseRunManifest } from '../../application/runs/run-manifest-schema.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { runPath } from './workspace-paths.js';

// Architecture section 7, data-model.md section 3.6, RF-003, RNF-002, RNF-003: `manifest.json` in
// the run folder, written through the OutputWriter (inside the owner's workspace, atomically: a
// temporary file, then a rename), masked like every file Rosetta writes. A file that is not a
// version 1 manifest is an error (RST-2106), never guessed.

export interface FileRunManifestStoreOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

function fileOf(scope: RunScope): WorkspaceFile {
  return { userId: scope.userId, path: `${runPath(scope.projectId, scope.runKey)}/manifest.json` };
}

function failed(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.runManifestFailed,
    `The manifest of a run could not be stored or read: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw failed('the file is not JSON', error);
  }
}

export class FileRunManifestStore implements RunManifestStore {
  private readonly options: FileRunManifestStoreOptions;

  constructor(options: FileRunManifestStoreOptions) {
    this.options = options;
  }

  async write(scope: RunScope, manifest: RunManifest): Promise<void> {
    const masked = parseRunManifest(maskDeep(manifest, this.options.masker));
    if (masked === undefined) throw new RosettaError(ERROR_CODES.secretMaskingFailed);
    const written = await this.options.writer.writeText(
      fileOf(scope),
      `${JSON.stringify(masked, null, 2)}\n`,
    );
    if (!written.ok) throw failed(written.error.message);
  }

  async read(scope: RunScope): Promise<RunManifest | undefined> {
    const read = await this.options.writer.readText(fileOf(scope));
    if (!read.ok) {
      if (read.error.reason === 'not-found') return undefined;
      throw failed(read.error.message);
    }
    const manifest = parseRunManifest(parseJson(read.value));
    if (manifest === undefined) throw failed('the file is not a version 1 manifest');
    return manifest;
  }
}
