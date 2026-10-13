import { describe, expect, it } from 'vitest';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
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
