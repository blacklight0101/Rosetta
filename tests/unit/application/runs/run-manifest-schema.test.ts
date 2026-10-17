import { describe, expect, it } from 'vitest';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RF-003, RF-401 (DEC-114): a manifest stored before the context fields existed still parses, and
// the context fields read as unknown; a stored value is kept.

describe('parseRunManifest context fields', () => {
  it('RF-401 reads a role written before the context fields as an unknown context', () => {
    const older = {
      ...sampleManifest(),
      roles: {
        reader: {
          provider: 'ollama',
          kind: 'ollama',
          model: 'model-a',
          modelVersion: null,
          modelDigest: null,
          toolMode: 'native',
          maxOutputTokens: 4096,
          temperature: null,
          maxTurns: 12,
        },
      },
    };

    expect(parseRunManifest(older)?.roles['reader']).toMatchObject({
      contextTokens: null,
      contextSource: null,
    });
  });

  it('RF-401 keeps a recorded context size and how it was chosen', () => {
    const manifest = sampleManifest();
    const stored = {
      ...manifest,
      roles: {
        reader: { ...manifest.roles['reader'], contextTokens: 16384, contextSource: 'auto-fit' },
      },
    };

    expect(parseRunManifest(stored)?.roles['reader']).toMatchObject({
      contextTokens: 16384,
      contextSource: 'auto-fit',
    });
  });
});

describe('parseRunManifest catalogue', () => {
  it('RF-606 keeps the catalogue version and SHA-256 a plan run recorded', () => {
    const stored = { ...sampleManifest(), catalogue: { version: 1, sha256: 'c'.repeat(64) } };

    expect(parseRunManifest(stored)?.catalogue).toEqual({ version: 1, sha256: 'c'.repeat(64) });
  });

  it('RNF-004 reads a manifest stored before the catalogue field as a run without a catalogue', () => {
    const older: Record<string, unknown> = { ...sampleManifest() };
    delete older['catalogue'];

    expect(parseRunManifest(older)?.catalogue).toBeNull();
  });
});

describe('parseRunManifest planning brief', () => {
  it('RF-604 keeps the planning brief a plan run recorded', () => {
    const brief = {
      ...buildBrief({ migration: 'rewrite' }, shippedCatalogue),
      savedAt: '2026-10-12T09:30:00.000Z',
    };

    expect(parseRunManifest({ ...sampleManifest(), brief })?.brief).toEqual(brief);
  });

  it('RNF-004 reads a manifest stored before the brief field as a run without a brief', () => {
    const older: Record<string, unknown> = { ...sampleManifest() };
    delete older['brief'];

    expect(parseRunManifest(older)?.brief).toBeNull();
  });
});
