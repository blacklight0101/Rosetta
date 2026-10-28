import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { builtByPeople, handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-641, RF-639, DEC-176 Q-D: checks.md lists a card whose tier has no model, never corrects it,
// and a package with every model named lists nothing; people building have no such section.

const masker = new SecretMasker();
const heading = '## Model of each card';

function checksOf(handoff: HandoffPackage): string {
  return renderHandoff(handoff, masker)['checks.md'] ?? '';
}

function withBuildMethod(buildMethod: HandoffPackage['brief']['buildMethod']): HandoffPackage {
  const base = handoffOf('Plain text.', emptyPrd);
  return { ...base, brief: { ...base.brief, buildMethod } };
}

describe('RF-641 checks.md: the model of each card', () => {
  it('RF-639 RF-641 lists every card whose tier has no model name, by card id', () => {
    const checks = checksOf(withBuildMethod({ aiAssisted: true }));

    expect(checks).toContain(heading);
    expect(checks).toMatch(/- T-\d+: .*no model/u);
  });

  it('RF-641 a package whose tiers all have a model lists no finding', () => {
    const checks = checksOf(
      withBuildMethod({ aiAssisted: true, agentTool: { kind: 'claude-code' } }),
    );

    expect(checks).not.toContain(heading);
  });

  it('RF-641 Q-D the package is still written when the check lists a finding', () => {
    const files = renderHandoff(withBuildMethod({ aiAssisted: true }), masker);

    expect(files['checks.md']).toContain(heading);
    expect(Object.keys(files).length).toBeGreaterThan(1);
  });

  it('RF-641 a build by people has no model check', () => {
    expect(checksOf(builtByPeople(withBuildMethod({ aiAssisted: true })))).not.toContain(heading);
  });
});
