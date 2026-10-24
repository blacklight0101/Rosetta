import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-608, P5-40: each section that counts what the package claims is written in checks.md
// with its entries, and a package with nothing to report has none of them.

const masker = new SecretMasker();
const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

function checksOf(extra: Partial<HandoffPackage>, prd = emptyPrd): string {
  return plain(renderHandoff(handoffOf('Plain text.', prd, extra), masker)['checks.md']);
}

function layeredComponents(base: HandoffPackage['content']) {
  return [
    { name: 'Pages', responsibility: 'r', role: 'presentation', dependsOn: ['Rules'] },
    { name: 'Rules', responsibility: 'r', role: 'business', dependsOn: ['Store'] },
    { name: 'Store', responsibility: 'r', role: 'data', dependsOn: [] },
  ].map((each) => ({ ...each, dependsOn: base.components.length > 0 ? each.dependsOn : [] }));
}

function step(claimId: string, component: string) {
  return {
    ...{ claimId, text: 'step', touches: null, component, action: 'a' },
    files: [],
    inferred: false,
  };
}

describe('checks.md: flows against the style', () => {
  it('RF-608 P5-40 lists a flow that goes from a page straight to data access, with its flow, steps and reason', () => {
    const base = handoffOf('Plain text.');
    const flows: HandoffPackage['flows'] = {
      flows: [
        {
          ...{ cardId: 'FLOW-005', title: 'Delete', trigger: 't', outcome: 'o' },
          steps: [step('FLOW-005.c1', 'Pages'), step('FLOW-005.c2', 'Store')],
        },
      ],
      outOfScope: [],
    };
    const content = { ...base.content, components: layeredComponents(base.content) };

    const checks = checksOf({ content, flows });

    expect(checks).toContain('## Flows against the style');
    expect(checks).toContain(
      '| FLOW-005 | Pages | Store | a layer may call only the layer directly below it |',
    );
  });

  it('RF-608 P5-40 a package whose flows follow the style has no such section', () => {
    expect(checksOf({})).not.toContain('## Flows against the style');
  });
});

describe('checks.md: phase titles', () => {
  it('RF-627 P5-40 lists the old and the new name of a renamed phase', () => {
    const base = handoffOf('Plain text.');
    const content = {
      ...base.content,
      phaseNotes: [{ phase: 2, from: 'Marks', to: 'Attendance register' }],
    };

    const checks = checksOf({ content });

    expect(checks).toContain('## Phase titles');
    expect(checks).toContain('Phase 2: "Marks" is now "Attendance register"');
  });
});

describe('checks.md: Must screens over the cap and cards no requirement cites', () => {
  const prd = {
    ...emptyPrd,
    features: [
      { title: 'Pay', description: 'd', priority: 'Must' as const, sources: ['FEAT-001'] },
    ],
  };

  it('RF-627 P5-40 lists a Must screen dropped over the cap and a FEAT card no requirement cites', () => {
    const base = handoffOf('Plain text.', prd);
    const content = {
      ...base.content,
      requirements: [
        { id: 'REQ-001', title: 'Pay', statement: 's', sources: ['FEAT-001', 'SCRN-021'] },
      ],
      tasks: [planTask({ requirements: ['REQ-001'] })],
    };
    const legacy = [
      {
        ...{ cardId: 'SCRN-021', title: 'Bills history', route: '/bills', target: null },
        ...{ disposition: 'dropped' as const, reason: 'Over the cap.', overCap: true as const },
      },
    ];
    const first = base.sources[0];
    const extra =
      first === undefined ? [] : [{ ...first, id: 'FEAT-030', title: 'Purge everything' }];
    const sources = [...base.sources, ...extra];

    const checks = checksOf({ content, sources, ux: { ...base.ux, legacy } }, prd);

    expect(checks).toContain('## Must screens dropped over the cap');
    expect(checks).toContain('- SCRN-021: Bills history');
    expect(checks).toContain('## Source cards that reach no requirement');
    expect(checks).toContain('- FEAT-030: Purge everything');
  });
});
