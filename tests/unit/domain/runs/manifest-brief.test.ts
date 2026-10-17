import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { recordManifestBrief } from '../../../../src/domain/runs/manifest-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RF-604, RNF-004: a plan run records the planning brief it was written from.

const brief = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };

describe('recordManifestBrief', () => {
  it('RF-604 records the planning brief on the manifest of a plan run', () => {
    const manifest = sampleManifest({ stage: 'plan' });

    expect(recordManifestBrief(manifest, brief)).toEqual({
      ok: true,
      value: { ...manifest, brief },
    });
  });

  it('RNF-004 does not change the brief of a run that has ended', () => {
    const ended = sampleManifest({ stage: 'plan', endState: 'Completed' });

    expect(recordManifestBrief(ended, brief)).toEqual({ ok: false, error: 'already-ended' });
  });
});
