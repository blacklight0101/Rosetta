import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { difficultyOfTask } from '../../../../src/domain/planning/task-method.js';
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
      withBuildMethod({
        aiAssisted: true,
        agentTool: { kind: 'claude-code' },
        models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
      }),
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

describe('RF-641 DEC-185 P6-22 checks.md: a tier model that runs locally', () => {
  const claude = {
    aiAssisted: true,
    agentTool: { kind: 'claude-code' },
    models: { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
  } as const;

  it('RF-641 lists the local-model warning for a card above difficulty 2 on a local tier', () => {
    const checks = checksOf(
      withBuildMethod({ ...claude, local: { smallest: true, middle: true, largest: true } }),
    );

    expect(checks).toContain(heading);
    expect(checks).toMatch(
      /- T-\d+ \(warning\): a local model builds only cards of difficulty 1 and 2/u,
    );
  });

  it('RF-641 a local flag on a tier no card is built on lists nothing', () => {
    const base = handoffOf('Plain text.', emptyPrd);
    const tiers = new Set(base.content.tasks.map((task) => difficultyOfTask(task).tier));
    const unused = (['smallest', 'middle', 'largest'] as const).find((tier) => !tiers.has(tier));
    if (unused === undefined) throw new Error('every tier has a card: no unused tier to test');

    const checks = checksOf(withBuildMethod({ ...claude, local: { [unused]: true } }));

    expect(checks).not.toContain('local model');
  });

  it('RF-641 a brief without the flag gives the same checks.md as one with no local key', () => {
    expect(checksOf(withBuildMethod(claude))).toBe(
      checksOf(builtByPeople(withBuildMethod({ aiAssisted: false }))),
    );
    expect(checksOf(withBuildMethod(claude))).not.toContain('local model');
  });
});

// RF-641, owner decision of 2026-10-29: at plan time no card carries "escalation, owner approved",
// so a card the tier table puts on the escalation model is a finding in checks.md, and no card
// line shows escalation.
describe('RF-641 plan-time cards on the escalation model', () => {
  const sameModel = withBuildMethod({
    aiAssisted: true,
    agentTool: { kind: 'claude-code' },
    models: { smallest: 'fable', middle: 'fable', largest: 'fable', escalation: 'fable' },
  });

  it('RF-641 checks.md reports each such card as needing the owner approval, unlabelled', () => {
    const checks = checksOf(sameModel);

    expect(checks).toContain(heading);
    expect(checks).toMatch(
      /^- T-\d+: uses the escalation model, which needs the owner approval$/mu,
    );
    expect(checks).not.toMatch(/\((note|warning)\)/u);
  });

  it('RF-641 no card line shows escalation at plan time', () => {
    const tasks = renderHandoff(sameModel, masker)['tasks.md'] ?? '';

    expect(tasks).toContain('model: fable');
    expect(tasks).not.toMatch(/escalation/iu);
  });
});
