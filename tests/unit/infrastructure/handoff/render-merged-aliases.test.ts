import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P5-32, RF-602: a card merged away stays reachable in sources.md by its old id.

describe('P5-32 sources.md aliases', () => {
  const base = handoffOf('Plain text.');
  const [first] = base.sources;
  const withAlias = {
    ...base,
    sources: first === undefined ? [] : [{ ...first, mergedFrom: [first.id, 'FEAT-007'] }],
  };

  it('lists the merged ids under the kept card with an anchor of their own', () => {
    const sources = renderHandoff(withAlias, new SecretMasker())['sources.md'] ?? '';

    expect(sources).toContain('Merged ids: FEAT-007');
    expect(sources).toContain('<a id="feat-007"></a>');
  });

  it('writes nothing for a card that merged nothing', () => {
    const sources = renderHandoff(base, new SecretMasker())['sources.md'] ?? '';

    expect(sources).not.toContain('Merged ids');
  });
});
