import { describe, expect, it } from 'vitest';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-639, RF-640, RF-641, DEC-185, P7-12, EV-61, EV-72: a tier model that runs locally is said so
// in the band table and in agents/README.md, also when no card is in that tier; its band stops at
// difficulty 2, so a card above it goes to the next tier, and the check has no local warning to give.

const masker = new SecretMasker();

/** The Invoice-shaped brief: Codex, the smallest tier a local model, the others named. */
const invoice: BuildMethod = {
  aiAssisted: true,
  agentTool: { kind: 'codex' },
  models: { smallest: 'gemma4:e4b', middle: 'gpt-mid', largest: 'gpt-top' },
  local: { smallest: true },
};

function filesOf(method: BuildMethod): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  const tasks = [planTask({ id: 'T-001' }), planTask({ id: 'T-002', title: 'Second' })];
  const content = { ...base.content, tasks };
  return renderHandoff({ ...base, content, brief: { ...base.brief, buildMethod: method } }, masker);
}

describe('P7-12 the band table says a tier runs locally', () => {
  it('RF-640 RF-641 the smallest tier row says it runs locally and stops at difficulty 2', () => {
    const text = filesOf(invoice)['orchestration.md'] ?? '';

    expect(text).toMatch(/^\| 1 to 2 \| smallest \| gemma4:e4b, runs locally \|/mu);
  });

  it('RF-640 RF-641 the cards above the local band go to the next tier, whose band starts at 3', () => {
    const text = filesOf(invoice)['orchestration.md'] ?? '';

    expect(text).toMatch(/^\| 3 to 8 \| middle \| gpt-mid \|/mu);
    expect(text).not.toMatch(/\| 1 to 5 \|/u);
    expect(text).toMatch(/runs locally[^\n]*difficulty 2/iu);
  });

  it('RF-640 a package with no local tier keeps the bands 1 to 5, 6 to 8 and 9 to 10', () => {
    const text = filesOf({ ...invoice, local: undefined })['orchestration.md'] ?? '';

    expect(text).toContain('| 1 to 5 | smallest | gemma4:e4b |');
    expect(text).toContain('| 6 to 8 | middle | gpt-mid |');
    expect(text).not.toContain('runs locally');
  });

  it('RF-641 the local flag is shown with no model named for the tier', () => {
    const text =
      filesOf({
        aiAssisted: true,
        agentTool: { kind: 'other', name: 'Tool' },
        local: { smallest: true },
      })['orchestration.md'] ?? '';

    expect(text).toMatch(/^\| 1 to 2 \| smallest \| .*runs locally/mu);
  });
});

describe('P7-12 agents/README.md says a tier runs locally', () => {
  it('RF-642 the smallest builder row says it runs locally, also when no card is in that tier', () => {
    const readme = filesOf(invoice)['agents/README.md'] ?? '';

    expect(readme).toMatch(/builder-smallest\.md[^\n]*gemma4:e4b[^\n]*runs locally/u);
    expect(readme).not.toMatch(/builder-middle\.md[^\n]*runs locally/u);
  });
});

describe('P7-12 a local tier is given no card above difficulty 2', () => {
  it('RF-639 RF-641 a card of difficulty 4 goes to the middle tier when the smallest runs locally', () => {
    const tasks = filesOf(invoice)['tasks.md'] ?? '';

    expect(tasks).toContain('Difficulty: 4 (middle tier, model: gpt-mid)');
    expect(tasks).not.toContain('smallest tier, model: gemma4:e4b');
  });

  it('RF-639 the same card stays in the smallest tier when nothing runs locally', () => {
    const tasks = filesOf({ ...invoice, local: undefined })['tasks.md'] ?? '';

    expect(tasks).toContain('Difficulty: 4 (smallest tier, model: gemma4:e4b)');
  });

  it('RF-641 the check lists no local-model warning, because no card is given to the local model', () => {
    const checks = filesOf(invoice)['checks.md'] ?? '';

    expect(checks).not.toContain('a local model builds only cards');
  });
});
