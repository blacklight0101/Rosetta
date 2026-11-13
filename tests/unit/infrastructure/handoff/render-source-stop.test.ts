import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-604, RF-614, P3-121: a package planned from an understand run that ended at a cap says so in its
// README and in checks.md, with how many claims the run never judged; a package from a completed run
// says nothing about a cap.

const masker = new SecretMasker();

describe('a package planned from a run that stopped at a cap', () => {
  const files = renderHandoff(
    { ...handoffOf('Plain text.'), sourceStop: { unjudgedClaims: 7, totalClaims: 20 } },
    masker,
  );

  it('RF-604 P3-121 checks.md names the stop and how many claims were never judged', () => {
    const checks = files['checks.md'] ?? '';

    expect(checks).toContain('## Source run stopped at a cap');
    expect(checks).toContain('7 of 20 claims were never judged');
    expect(checks).toContain('excluded');
  });

  it('RF-604 P3-121 the README says so in its first lines', () => {
    const readme = files['README.md'] ?? '';

    expect(readme).toContain('stopped at a cap');
    expect(readme.indexOf('stopped at a cap')).toBeLessThan(readme.indexOf('## Reading order'));
  });

  it('RF-604 P3-121 one claim not judged is not plural', () => {
    const one = renderHandoff(
      { ...handoffOf('Plain text.'), sourceStop: { unjudgedClaims: 1, totalClaims: 1 } },
      masker,
    );

    expect(one['checks.md']).toContain('1 of 1 claim was never judged');
  });
});

describe('a package planned from a run its owner stopped at the approved amount', () => {
  const files = renderHandoff(
    {
      ...handoffOf('Plain text.'),
      sourceStop: { unjudgedClaims: 3, totalClaims: 10, atApproval: true },
    },
    masker,
  );

  it('RF-432 P9-03 checks.md and the README name the stop at the approved amount, not a cap', () => {
    const checks = files['checks.md'] ?? '';
    const readme = files['README.md'] ?? '';

    expect(checks).toContain('## Source run stopped at the approved amount');
    expect(checks).toContain('3 of 10 claims were never judged');
    expect(readme).toContain('stopped at the approved amount');
    expect(`${checks}${readme}`).not.toContain('at a cap');
  });
});

describe('a package planned from a completed run', () => {
  it('RF-604 P3-121 says nothing about a cap', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(files['checks.md']).not.toContain('stopped at a cap');
    expect(files['README.md']).not.toContain('stopped at a cap');
  });
});
