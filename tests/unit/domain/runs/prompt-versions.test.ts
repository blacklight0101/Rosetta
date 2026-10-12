import { describe, expect, it } from 'vitest';
import { recordPromptVersions } from '../../../../src/domain/runs/run-manifest.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RNF-004: the manifest records every prompt file a run used, with its version and SHA-256.

const hash = (digit: string) => digit.repeat(64);

describe('recordPromptVersions', () => {
  it('RNF-004 adds the prompt versions in name order and keeps the ones already recorded', () => {
    const manifest = sampleManifest({
      promptVersions: { 'reader/task.v1.md': { version: 'v1', sha256: hash('1') } },
    });

    const recorded = recordPromptVersions(manifest, {
      'reader/area.v1.md': { version: 'v1', sha256: hash('2') },
      'cards/repair.v1.md': { version: 'v1', sha256: hash('3') },
    });

    expect(Object.keys(recorded.promptVersions)).toEqual([
      'cards/repair.v1.md',
      'reader/area.v1.md',
      'reader/task.v1.md',
    ]);
    expect(recorded.promptVersions['reader/area.v1.md']).toEqual({
      version: 'v1',
      sha256: hash('2'),
    });
  });
});
