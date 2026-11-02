import { describe, expect, it } from 'vitest';
import { separateFrontEnd } from '../../support/api-plan-harness.js';
import { withCoverageAnswer, withTasks } from '../../support/coverage-plan-harness.js';
import { plain, seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P8-02, RF-607, RF-627, ADR-018, EV-83: given SDD, a package task card with an empty
// `requirements` is not left out when the answer is checked. Once the cards are linked to the items
// they build, it takes every requirement that cites a source card behind them (P7-14), and only a
// card with nothing to derive one from is left out, named in checks.md by its position.

const temp = useTempRoot('rosetta-derived-');

const card = {
  phase: 1,
  acceptanceCriteria: [
    'Given a basket of 60, when the customer confirms, then the order is stored.',
  ],
  invariant: 'An order is stored once.',
  riskClass: 'none',
  adds: [],
  probes: [],
  files: [],
  needs: [],
  dependsOn: [],
};

async function derivedPlan() {
  const h = await seededUxPlan(temp.path, {
    recording: await withTasks([
      { ...card, title: 'Derived card', requirements: [] },
      { ...card, title: 'Nothing to build', requirements: [] },
      { ...card, title: 'Waits for nothing', requirements: [1], dependsOn: [2] },
    ]),
    harness: {
      coverageRecording: await withCoverageAnswer(
        JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] }),
      ),
    },
  });
  await h.saveBrief({ ...separateFrontEnd, principles: ['sdd'] });
  const run = await h.plan();
  return { h, run, files: await h.handoffOf(run) };
}

function cardText(tasks: string, title: string): string {
  const start = tasks.indexOf(`**${title}**`);
  if (start < 0) return '';
  const next = tasks.indexOf('\n## T-', start);
  return tasks.slice(start, next < 0 ? undefined : next);
}

describe('BuildPlan: a package card with no requirement under SDD (P8-02)', () => {
  it('P8-02 RF-607 a card that builds an item takes the requirements behind it', async () => {
    const { files } = await derivedPlan();

    const tasks = plain(files['tasks.md']);
    expect(tasks).toContain('Derived card');
    expect(cardText(tasks, 'Derived card')).toMatch(/Requirements: \[REQ-\d{3}\]/u);
  });

  it('P8-02 RF-607 a card with nothing to derive is left out and named in checks.md', async () => {
    const { h, files } = await derivedPlan();

    expect(plain(files['tasks.md'])).not.toContain('Nothing to build');
    const checks = plain(files['checks.md']);
    expect(checks).toMatch(/builds nothing a requirement could be taken from/u);
    const warned = h.s.logger.entries.map((entry) => entry.message).join('\n');
    expect(warned).toMatch(/Task card at position 2 of the plan answer was left out/u);
  });

  it('P8-02 RF-607 the other cards are numbered again and no card waits for the one left out', async () => {
    const { files } = await derivedPlan();

    const tasks = plain(files['tasks.md']);
    const waits = cardText(tasks, 'Waits for nothing');
    expect(waits).not.toBe('');
    expect(waits).not.toMatch(/Nothing to build/u);
  });
});
