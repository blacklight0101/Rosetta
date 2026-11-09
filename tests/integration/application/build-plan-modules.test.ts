import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { separateFrontEnd } from '../../support/api-plan-harness.js';
import { gapRecordingOfAll } from '../../support/gap-plan-harness.js';
import { plain } from '../../support/plan-method-harness.js';
import { FixtureScans, scanOf } from '../../support/scan-shape-fixtures.js';
import { artefactKindsOf } from '../../../src/infrastructure/scan/universal/artefact-rules.js';
import { useTempRoot } from '../../support/temp-root.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';

// P8-06, RF-601, RF-607, RF-627, RNF-004, EV-32: a plan run over a scan with three modules (an
// orders web app, a WebForms admin app, a WinForms desk client) and deployment material (a k8s
// folder and a Dockerfile). The recorded cards of the demo plan build every item of the documents
// and no module, so the gap call (gap.v5) asks for the modules and the deployment by id; what it
// leaves without a card is named in checks.md with the reason and never fails the run, under SDD
// and not. Names are synthetic.

const temp = useTempRoot('rosetta-plan-modules-');

const listed = scanOf({
  'src/Orders/Orders.csproj': '<Project />',
  'src/Orders/Checkout.cs': '// x',
  'src/Admin.WebForms/Admin.WebForms.csproj': '<Project />',
  'src/Admin.WebForms/Default.aspx': '<%@ Page %>',
  'src/Desk.WinForms/Desk.WinForms.csproj': '<Project />',
  'src/Desk.WinForms/MainForm.cs': '// x',
  'deploy/k8s/orders.yaml': 'kind: Deployment',
  'src/Orders/Dockerfile': 'FROM x',
  'tests/Orders.Tests/Orders.Tests.csproj': '<Project />',
  '.github/workflows/test.yml': 'on: push',
});

// The scan tags each file with its artefact kinds (a `.csproj` is a manifest), as the real scan does.
const scan = {
  ...listed,
  codeMap: {
    files: listed.codeMap.files.map((each) => ({
      ...each,
      artefactKinds: artefactKindsOf(each.path),
    })),
  },
};

const items = [
  'module:src/Admin.WebForms',
  'module:src/Desk.WinForms',
  'module:src/Orders',
  'deployment:source',
];

const portCards = JSON.stringify({
  tasks: [
    {
      title: 'Port the admin pages and the desk client',
      phase: 1,
      requirements: [],
      invariant: 'An admin and a desk clerk can still do every task the legacy apps let them do.',
      acceptanceCriteria: [
        'Given an order of 3 items, when an admin opens it in the new admin page, then the 3 items are shown.',
      ],
      riskClass: 'none',
      adds: [],
      probes: [],
      files: ['src/admin/', 'tests/admin/'],
      dependsOn: [],
      builds: ['module:src/Admin.WebForms', 'module:src/Desk.WinForms'],
    },
    {
      title: 'Build and ship the new system in containers',
      phase: 1,
      requirements: [],
      invariant:
        'Every change is built and tested the same way, and a failing build ships nothing.',
      acceptanceCriteria: [
        'Given a change that breaks a test, when the pipeline runs, then no image is pushed.',
      ],
      riskClass: 'none',
      adds: [],
      probes: [],
      files: ['Dockerfile', '.github/workflows/ci.yml'],
      dependsOn: [],
      builds: ['deployment:source'],
    },
  ],
});

/** P8-06: the same answer whose deployment card names no item and only writes new CI files. */
const unlinkedDeployment = portCards.replace('"builds":["deployment:source"]', '"builds":[]');

async function plannedWith(
  gap: string | readonly string[] | undefined,
  principles?: readonly string[],
) {
  const answers = typeof gap === 'string' ? [gap] : gap;
  const harness = {
    scans: new FixtureScans(scan),
    ...(answers === undefined ? {} : { gapRecording: gapRecordingOfAll(...answers) }),
  };
  const h = await seededUxPlan(temp.path, { harness });
  if (principles !== undefined) await h.saveBrief({ ...separateFrontEnd, principles });
  await h.seedScan();
  const run = await h.plan();
  return { h, run, files: await h.handoffOf(run) };
}

function modulesSection(checks: string | undefined): string {
  return (
    plain(checks)
      .split(/^## /mu)
      .find((part) => part.startsWith('Modules')) ?? ''
  );
}

describe('BuildPlan: the modules of the scan are items of the gap call', () => {
  it('RF-601 RF-627 asks for each module and the deployment by id with gap.v5, and coverage.v2 links them', async () => {
    const { h } = await plannedWith(undefined);

    const coverage = h.providers.coverageRequests()[0];
    const linking = coverage?.messages.map((each) => each.content).join('\n') ?? '';
    for (const id of items) expect(linking).toContain(`"id": "${id}"`);
    expect(coverage?.system).toBe(await readFile('prompts/planner/coverage.v2.md', 'utf8'));
    const gap = h.providers.gapRequests()[0];
    const message = gap?.messages.map((each) => each.content).join('\n') ?? '';
    for (const id of items) expect(message).toContain(`"id": "${id}"`);
    expect(gap?.system).toBe(await readFile('prompts/planner/gap.v5.md', 'utf8'));
  });

  it('RF-601 a module with no card is named in checks.md with the reason and the run still completes', async () => {
    const { run, files, h } = await plannedWith(undefined);

    expect(run.endState).toBe('Completed');
    const section = modulesSection(files['checks.md']);
    expect(section).toMatch(/^Modules with no task card/u);
    for (const path of ['src/Admin.WebForms', 'src/Desk.WinForms', 'src/Orders']) {
      expect(section).toContain(`| ${path} |`);
    }
    expect(section).toContain('Deployment material: deploy, src/Orders/Dockerfile');
    expect(section).toContain('The planner wrote no task card for it');
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });
});

describe.each([
  ['under SDD', ['sdd']],
  ['without SDD', ['kiss']],
])('BuildPlan: the gap cards for the modules, %s', (_, principles) => {
  it('RF-607 keeps the module card and the deployment card that builds it by id, and names only the module left', async () => {
    const { run, files } = await plannedWith(portCards, principles);

    expect(run.endState).toBe('Completed');
    const section = modulesSection(files['checks.md']);
    expect(section).toContain('| src/Orders |');
    expect(section).not.toContain('Admin.WebForms');
    expect(section).not.toContain('Deployment material');
    const tasks = plain(files['tasks.md']);
    expect(tasks).toContain('[Module](checks.md) src/Admin.WebForms');
    expect(tasks).toContain('[Deployment](checks.md) source: Deployment material');
  });
});

describe('BuildPlan: what does not count as a module or as the legacy deployment', () => {
  it('RF-601 a card that only writes new CI and Docker files leaves the legacy deployment named in checks.md', async () => {
    expect(unlinkedDeployment).not.toBe(portCards);

    const { run, files } = await plannedWith([unlinkedDeployment, '{"tasks": []}'], ['sdd']);

    expect(run.endState).toBe('Completed');
    const section = modulesSection(files['checks.md']);
    expect(section).toContain('Deployment material: deploy, src/Orders/Dockerfile');
    expect(section).not.toContain('Admin.WebForms');
  });

  it('RF-601 a test project and a test-only CI workflow are named as not counted, never dropped', async () => {
    const { files } = await plannedWith(undefined);

    const checks = plain(files['checks.md']);
    const notCounted =
      checks.split(/^## /mu).find((part) => part.startsWith('Folders and files')) ?? '';
    expect(notCounted).toContain('| tests/Orders.Tests | A test project');
    expect(notCounted).toContain('| .github/workflows/test.yml | A CI file');
    expect(modulesSection(files['checks.md'])).not.toContain('Orders.Tests');
  });
});
