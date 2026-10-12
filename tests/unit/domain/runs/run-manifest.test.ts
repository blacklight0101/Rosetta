import { describe, expect, it } from 'vitest';
import {
  endManifest,
  markManifestStarted,
  recordManifestCodeMap,
  recordManifestSkippedLinks,
  recordManifestSource,
} from '../../../../src/domain/runs/run-manifest.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RF-003, RF-126: the manifest records when the run started, what source it resolved and how it
// ended; the end state is set exactly once.

describe('run manifest', () => {
  it('RF-003 records when a queued run started', () => {
    const manifest = sampleManifest();

    expect(markManifestStarted(manifest, '2026-10-12T10:00:05.000Z')).toEqual({
      ...manifest,
      startedAt: '2026-10-12T10:00:05.000Z',
    });
  });

  it('RF-003 records the end state and time when the run ends', () => {
    const manifest = sampleManifest();

    const ended = endManifest(manifest, 'CapReached', '2026-10-12T10:05:00.000Z');

    expect(ended).toEqual({
      ok: true,
      value: { ...manifest, endState: 'CapReached', endedAt: '2026-10-12T10:05:00.000Z' },
    });
  });

  it('RF-003 sets the end state exactly once', () => {
    const first = endManifest(sampleManifest(), 'Completed', '2026-10-12T10:05:00.000Z');
    if (!first.ok) throw new Error('The manifest did not end');

    expect(endManifest(first.value, 'Failed', '2026-10-12T10:06:00.000Z')).toEqual({
      ok: false,
      error: 'already-ended',
    });
  });
});

describe('run manifest source', () => {
  it('RF-126 records the commit and the snapshot hash once the source is resolved', () => {
    const manifest = sampleManifest();
    const resolved = { commitSha: 'a'.repeat(40), snapshotHash: `sha256:${'b'.repeat(64)}` };

    expect(recordManifestSource(manifest, resolved)).toEqual({
      ok: true,
      value: { ...manifest, source: { ...manifest.source, ...resolved } },
    });
  });

  it('RF-126 does not change the source of a run that has ended', () => {
    const ended = endManifest(sampleManifest(), 'Failed', '2026-10-12T10:05:00.000Z');
    if (!ended.ok) throw new Error('The manifest did not end');

    const resolved = { commitSha: 'a'.repeat(40), snapshotHash: `sha256:${'b'.repeat(64)}` };

    expect(recordManifestSource(ended.value, resolved)).toEqual({
      ok: false,
      error: 'already-ended',
    });
  });
});

describe('run manifest of a scan', () => {
  it('RF-003 records the code map hash and nothing else', () => {
    const manifest = sampleManifest();

    expect(recordManifestCodeMap(manifest, 'c'.repeat(64))).toEqual({
      ok: true,
      value: { ...manifest, codemapHash: 'c'.repeat(64) },
    });
  });

  it('RF-127 records the skipped links in the security block', () => {
    const manifest = sampleManifest();

    expect(recordManifestSkippedLinks(manifest, 2)).toEqual({
      ok: true,
      value: { ...manifest, security: { ...manifest.security, skippedLinks: 2 } },
    });
  });

  it('RF-003 does not change a manifest that has ended', () => {
    const ended = endManifest(sampleManifest(), 'Failed', '2026-10-12T10:05:00.000Z');
    if (!ended.ok) throw new Error('The manifest did not end');

    expect(recordManifestCodeMap(ended.value, 'c'.repeat(64))).toEqual({
      ok: false,
      error: 'already-ended',
    });
    expect(recordManifestSkippedLinks(ended.value, 1)).toEqual({
      ok: false,
      error: 'already-ended',
    });
  });
});
