import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../src/application/plan/plan-answer.js';
import { loadPlannerPrompt } from '../../../src/infrastructure/prompts/prompt-files.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { packageOf, plain } from '../../support/plan-method-harness.js';
import { draftTask } from '../../support/task-card-fixtures.js';
import { filledExampleOf } from '../../support/prompt-example.js';

// RF-608, DEC-76, ADR-018: the package checks the components against the chosen style. Real
// packages written from planner answers the planner could give, replayed by the fake provider.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

interface Part {
  readonly name: string;
  readonly role: string;
  readonly dependsOn: readonly string[];
}

function part(name: string, role: string, dependsOn: string[] = []): Part {
  return { name, role, dependsOn };
}

function recordingWith(components: readonly Part[]) {
  const text = JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements: [
      { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
    ],
    components: components.map((each) => ({ ...each, responsibility: 'Does its part.' })),
    phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
    tasks: [draftTask({ title: 'Orders' })],
    risks: [{ text: 'The shipping rule is read twice.', sources: ['BR-001'] }],
  });
  const reply = (answer: string) => ({
    retried: [],
    response: { text: answer, toolCalls: [], usage, finishReason: 'stop' as const },
  });
  return recordingOf(reply(text), reply('No PRD.'), reply('No data model.'), reply('No flows.'));
}

const hexagonal = { architecture: { style: 'hexagonal' }, migration: 'strangler-fig' } as const;
const layered = { architecture: { style: 'layered' }, migration: 'strangler-fig' } as const;

// The evaluation of 2026-10-21: the core depends on the data access layer.
const evaluated = [
  part('API Gateway', 'adapter', ['Business Core']),
  part('Business Core', 'core', ['Data Access Layer', 'Workflow Service']),
  part('Data Access Layer', 'adapter'),
  part('Presentation Layer', 'adapter', ['API Gateway']),
  part('Workflow Service', 'core'),
];

describe('RF-608 a broken rule of the chosen style is reported', () => {
  it('RF-608 the recorded hexagonal answer lists the core-to-data dependency and no longer says the components follow the style', async () => {
    const files = await packageOf(hexagonal, recordingWith(evaluated));

    const checks = plain(files['checks.md']);
    expect(checks).toContain('## Components against the style');
    expect(checks).toContain('| Business Core | Data Access Layer |');
    expect(checks).toContain('the core must depend on no adapter');
    const architecture = plain(files['architecture.md']);
    expect(architecture).not.toContain('The components below follow');
    expect(architecture).toContain('do not all follow the Hexagonal (ports and adapters) style');
    expect(architecture).toContain('checks.md');
    const risks = plain(files['risks.md']);
    expect(risks).toContain('## RISK-002');
    expect(risks).toContain('Business Core depends on Data Access Layer');
  });

  it('RF-608 each component shows its role in architecture.md', async () => {
    const files = await packageOf(hexagonal, recordingWith(evaluated));

    expect(plain(files['architecture.md'])).toContain('- **Business Core** (core): Does its part.');
  });
});

describe('RF-608 a clean answer has no finding', () => {
  it('RF-608 a clean layered answer keeps the sentence, adds no risk and checks.md says every rule holds', async () => {
    const files = await packageOf(
      layered,
      recordingWith([
        part('Pages', 'presentation', ['Rules']),
        part('Rules', 'business', ['Tables']),
        part('Tables', 'data'),
      ]),
    );

    expect(plain(files['architecture.md'])).toContain('The components below follow the Layered');
    expect(plain(files['checks.md'])).toContain('No dependency breaks the rule of the style.');
    expect(plain(files['risks.md'])).not.toContain('RISK-002');
  });
});

describe('RF-608 a component without a known role is listed', () => {
  it('RF-608 an unknown role is listed in checks.md and its dependencies are not judged', async () => {
    const files = await packageOf(
      hexagonal,
      recordingWith([
        part('Business Core', 'core', ['Data Access Layer']),
        part('Data Access Layer', 'persistence'),
        part('Admin', '', ['Business Core']),
      ]),
    );

    const checks = plain(files['checks.md']);
    expect(checks).toContain('| Data Access Layer | persistence |');
    expect(checks).toContain('| Admin | none |');
    expect(checks).not.toContain('the core must depend on no adapter');
    expect(plain(files['architecture.md'])).toContain('The components below follow the Hexagonal');
  });
});

describe('RF-608 RNF-004 the planner is asked for the role', () => {
  it('RF-608 RNF-004 the planner prompt the run loads is package.v9.md at version v9', async () => {
    const file = await loadPlannerPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/package.v9.md', version: 'v9' });
  });

  it('RF-608 package.v9.md asks for the role and its example answer carries one', async () => {
    const prompt = await readFile('prompts/planner/package.v9.md', 'utf8');
    const example = filledExampleOf(prompt);

    expect(prompt).toContain('role');
    expect(prompt).toContain('roles of the chosen style');
    expect(parsePlanAnswer(example)?.components.map((each) => each.role)).not.toContain('');
  });
});

describe('RF-608 the planner is sent the roles of the chosen style', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-style-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('RF-608 the owner block names the roles of the hexagonal style', async () => {
    const h = await createPlanHarness(dataDir, recordingWith(evaluated));
    await h.understandRun({ cards: planCards(), questions: planQuestions });
    await h.saveBrief(hexagonal);

    await h.plan();

    const [request] = h.providers.requests();
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    expect(message).toMatch(/"roles": \[\s*"core",\s*"port",\s*"adapter"\s*\]/u);
  });
});
