import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { base, claim, judgedCard } from '../../support/plan-cards.js';
import { draftTask } from '../../support/task-card-fixtures.js';

// P5-43, RF-602: a plan run whose planner reworded a claim beyond its meaning. The cards say the
// doctor rejects an appointment and the code lists the current month; the recorded plan says delete,
// invents an administrator and the README says weekly. The run lists the clash in checks.md, marks
// the role as proposed and sends the planner and the package the code claim only.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

const reply = (text: string) => ({
  retried: [],
  response: { text, toolCalls: [], usage, finishReason: 'stop' as const },
});

const plan = JSON.stringify({
  summary: 'A hospital application that replaces the legacy one.',
  requirements: [
    {
      title: 'Pending appointments',
      statement: 'A doctor can delete the pending appointment.',
      sources: ['FEAT-001'],
    },
  ],
  components: [
    { name: 'Appointment service', responsibility: 'Keeps appointments.', dependsOn: [] },
  ],
  decisions: [],
  phases: [{ name: 'Appointments', goal: 'Appointments move.', exitCriteria: ['They run.'] }],
  tasks: [draftTask({ title: 'Appointments' })],
});

const prd = JSON.stringify({
  roles: [
    { name: 'Doctor', description: 'Handles appointments.', sources: ['FEAT-001'] },
    { name: 'Administrator', description: 'Manages everything.', sources: ['FEAT-001'] },
  ],
});

const cards = [
  judgedCard(
    {
      ...base('FEAT-001', 'FEAT', 'Pending appointments'),
      claims: [
        claim('Only a doctor may reject a pending appointment.', 'src/Appointments.cs'),
        claim('Reject sets the status of the appointment to rejected.', 'src/Appointments.cs'),
      ],
    },
    ['Supported', 'Supported'],
  ),
  judgedCard(
    {
      ...base('FEAT-002', 'FEAT', 'Appointments view'),
      claims: [
        claim('The view lists the appointments of the current month.', 'src/Views.cs'),
        claim('The administrator sees the weekly appointments view.', 'README.md'),
      ],
    },
    ['Supported', 'Supported'],
  ),
];

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-meaning-'));
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

describe('BuildPlan: the plan keeps the meaning of its claims', () => {
  async function planned() {
    const h = await createPlanHarness(
      dataDir,
      recordingOf(reply(plan), reply(prd), reply('No data model.'), reply('No flows.')),
    );
    await h.understandRun({ cards, questions: [] });
    await h.saveBrief({ architecture: { style: 'layered' }, migration: 'strangler-fig' });
    const run = await h.plan();
    return { h, files: await h.handoffOf(run) };
  }

  it('RF-602 checks.md lists the requirement that deletes what the claim rejects', async () => {
    const { files } = await planned();

    const checks = files['checks.md'] ?? '';
    expect(checks).toContain('## Meaning of the source claims');
    expect(checks).toMatch(
      /REQ-001: the statement says it removes it; FEAT-001\.c\d says it marks/u,
    );
  });

  it('RF-602 prd.md marks the role no claim states as proposed, and not the one a claim states', async () => {
    const { files } = await planned();

    const text = (files['prd.md'] ?? '').replaceAll('\\', '');
    expect(text).toContain('**Administrator** (proposed: no claim states this role)');
    expect(text).not.toContain('**Doctor** (proposed');
  });

  it('RF-602 the README claim reaches neither the planner nor sources.md; checks.md lists it', async () => {
    const { h, files } = await planned();

    const sent = h.providers
      .requests()
      .map((request) => request.messages.map((each) => each.content).join('\n'))
      .join('\n');
    expect(sent).toContain('current month');
    expect(sent).not.toContain('weekly appointments view');
    expect(files['sources.md'] ?? '').toContain('current month');
    expect(files['sources.md'] ?? '').not.toContain('weekly appointments view');
    expect(files['checks.md'] ?? '').toContain('Documentation claims overruled by the code');
    expect(files['checks.md'] ?? '').toContain('FEAT-002.c2');
  });
});
