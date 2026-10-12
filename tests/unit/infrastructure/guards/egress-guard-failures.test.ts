import { describe, expect, it } from 'vitest';
import type {
  OutputWriter,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import type { RunManifestStore } from '../../../../src/application/ports/run-manifest-store.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err, type Result } from '../../../../src/domain/errors/result.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { RunManifest } from '../../../../src/domain/runs/run-manifest.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import type {
  MaskResult,
  TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  egressHarness,
  readConversation,
  requestWith,
  toolResult,
  type EgressHarness,
} from '../../../support/egress-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-141, RF-142, DEC-57, ADR-013: every way the guard can fail before a call goes through the
// same path: a `security` entry with the code, one more blocked call in the manifest, the error
// thrown and nothing sent; no egress line is written for a call that was not sent.

/** A writer whose appends fail, as a full disk would. */
class FullDiskWriter extends MemoryOutputWriter implements OutputWriter {
  override appendLine(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(
      err({ code: ERROR_CODES.writeOutsideWorkspace, reason: 'invalid-path', message: 'full' }),
    );
  }
}

/** A manifest store whose first write after the harness set it up fails. */
class OnceFailingStore extends MemoryRunManifestStore implements RunManifestStore {
  private writes = 0;

  override write(scope: RunScope, manifest: RunManifest): Promise<void> {
    this.writes += 1;
    if (this.writes === 2) return Promise.reject(new RosettaError(ERROR_CODES.runManifestFailed));
    return super.write(scope, manifest);
  }
}

/** A masker with a bug: it throws something that is not a RosettaError. */
class BrokenMasker implements TextMasker {
  mask(): MaskResult {
    throw new TypeError('masker bug');
  }
}

/** What a blocked call left behind: the error, what was sent, logged, counted and written. */
async function attemptBlocked(harness: EgressHarness): Promise<Record<string, unknown>> {
  const { guard, fake, logger, manifest, egressLines } = harness;
  const failure = await failureOf(
    guard.complete(requestWith(readConversation(toolResult({ text: 'x' })))),
  );
  return {
    failure,
    sent: fake.requests,
    entries: logger.entries,
    blockedCalls: (await manifest())?.security.blockedCalls,
    egressLines: await egressLines(),
  };
}

/** The traces every blocked call must leave, for the given code. */
function blockedWith(code: string): Record<string, unknown> {
  return {
    failure: expect.objectContaining({ code }),
    sent: [],
    entries: [expect.objectContaining({ level: 'warn', logger: 'security', code })],
    blockedCalls: 1,
    egressLines: [],
  };
}

describe('EgressGuard blocks on every failure', () => {
  it('RF-142 blocks and logs the call when its egress line cannot be stored', async () => {
    const harness = await egressHarness({ writer: new FullDiskWriter() });

    expect(await attemptBlocked(harness)).toEqual(blockedWith(ERROR_CODES.egressLogFailed));
  });

  it('RF-141 blocks and logs the call when the mask counts cannot be recorded', async () => {
    const harness = await egressHarness({ manifests: new OnceFailingStore() });

    expect(await attemptBlocked(harness)).toEqual(blockedWith(ERROR_CODES.runManifestFailed));
  });

  it('RF-141 blocks and logs the call when the masker fails with an unexpected error', async () => {
    const harness = await egressHarness({ masker: new BrokenMasker() });

    expect(await attemptBlocked(harness)).toEqual(blockedWith(ERROR_CODES.secretMaskingFailed));
  });
});
