import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planQuestions } from '../../support/plan-cards.js';
import { trdCards } from '../../support/trd-cards.js';

// RF-622, RF-620, RF-602, ADR-018, DEC-134, DEC-135: a plan run over the order-shop cards and two
// integration cards, with the planner replaying tests/recordings/fake/planner-trd.json. `trd.md`
// is checked by its structure: its sections, the decision record each one links, the generated
// diagram, the integrations and the security controls.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [
    { layer: 'database', choice: 'PostgreSQL', custom: false },
    { layer: 'hosting', choice: 'Docker on one host', custom: true },
  ],
  context: { keepIntegrations: ['The nightly stock feed'], dataMigration: 'One copy at cut-over' },
} as const;

const sections = [
  'Architecture overview',
  'Stack per layer',
  'Integrations',
  'Security and data protection',
  'Non-functional targets',
  'Deployment and environments',
  'Migration approach',
];

let dataDir: string;
let h: PlanHarness;
let files: Readonly<Record<string, string>>;

/** The text as a reader sees it: the escaper's backslashes removed. */
function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The sections of trd.md by their `## ` heading. */
function sectionsOf(trd: string): Map<string, string> {
  const parts = trd.split(/^## /mu).slice(1);
  return new Map(parts.map((part) => [part.split('\n')[0] ?? '', part]));
}

function trd(): string {
  return plain(files['trd.md']);
}

function section(name: string): string {
  return sectionsOf(trd()).get(name) ?? '';
}

/** The control of the security section that starts with this name. */
function control(name: string): string {
  const controls = section('Security and data protection').split(/^### /mu).slice(1);
  return controls.find((each) => each.startsWith(name)) ?? '';
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-trd-'));
  h = await createPlanHarness(
    dataDir,
    await loadRecording(join('tests', 'recordings', 'fake', 'planner-trd.json')),
  );
  await h.understandRun({ cards: trdCards(), questions: planQuestions });
  await h.saveBrief(briefAnswers);
  files = await h.handoffOf(await h.plan());
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('trd.md: the sections', () => {
  it('RF-622 holds the seven sections in order, and the README reading order links the file', () => {
    expect([...sectionsOf(trd()).keys()]).toEqual(sections);
    expect(files['README.md']).toContain('[Technical requirements document](trd.md)');
  });

  it('RF-622 every section links the decision records that decided it or says why none applies', () => {
    const link = String.raw`\[ADR-\d+\]\(decisions/ADR-\d+\.md\)`;
    const none = String.raw`none apply\. \S.*`;
    const allowed = new RegExp(`^Decision records: (${none}|${link}(, ${link})*)$`, 'u');
    const lines = sections.map(
      (name) =>
        section(name)
          .split('\n')
          .find((each) => each.startsWith('Decision records: ')) ?? 'missing',
    );
    expect(lines.filter((line) => !allowed.test(line))).toEqual([]);
    const pairs = lines.flatMap((line) =>
      [...line.matchAll(/\[(ADR-\d+)\]\(decisions\/(ADR-\d+)\.md\)/gu)].map(([, id, file]) => [
        id,
        file,
      ]),
    );
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.map(([id]) => id)).toEqual(pairs.map(([, file]) => file));
    const written = pairs.map(([, file]) => `decisions/${String(file)}.md`);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(written));
  });
});

describe('trd.md: what the planner is asked and what is left out', () => {
  it('RF-622 DEC-135 the planner is asked to mark every control that lists forbidden patterns', () => {
    const [request] = h.providers.requests();

    expect(request?.system).toMatch(/"approach"/u);
    expect(request?.system).toMatch(/denylist[^]*forbidden/u);
  });

  it('RF-602 RF-622 the log counts the technical items left out for want of a supported card', () => {
    const warnings = h.s.logger.entries.filter((entry) => entry.level === 'warn');

    expect(warnings.map((entry) => entry.message).join(' ')).toContain('4 technical item(s)');
  });
});

describe('trd.md: architecture and stack', () => {
  it('RF-622 the architecture overview draws the components with a generated Mermaid diagram', () => {
    const overview = section('Architecture overview');

    expect(overview).toContain('Hexagonal');
    expect(overview).toMatch(/```mermaid\nflowchart LR\n {2}c1\["Web front end"\]/u);
    expect(overview).toContain('c1 --> c2');
    expect(overview).toContain('Decision records: [ADR-004](decisions/ADR-004.md)');
    expect(plain(files['decisions/ADR-004.md'])).toContain('Architecture style: Hexagonal');
  });

  it('RF-609 RF-622 the stack per layer names each chosen technology with its record', () => {
    const stack = section('Stack per layer');

    expect(stack).toContain('| database | PostgreSQL | [ADR-005](decisions/ADR-005.md) |');
    expect(stack).toContain('| hosting | Docker on one host | [ADR-006](decisions/ADR-006.md) |');
    expect(stack).toMatch(/Not chosen: .*language and runtime/u);
    expect(stack).toContain('Decision records: [ADR-005](decisions/ADR-005.md), [ADR-006]');
  });
});

describe('trd.md: integrations', () => {
  it('RF-622 each integration card is linked, with keep or replace, and the owner list is kept', () => {
    const integrations = section('Integrations');

    expect(integrations).toContain(
      '| [INT-001](sources.md#int-001) | Payment gateway | Replace | The new service wraps the gateway behind one port. |',
    );
    expect(integrations).toContain(
      '| [INT-002](sources.md#int-002) | Warehouse mail | Not decided |',
    );
    expect(integrations).not.toContain('INT-009');
    expect(integrations).not.toMatch(/FEAT-|BR-|ENT-|OQ-/u);
    expect(integrations).not.toContain('A second answer');
    expect(integrations).toContain('The nightly stock feed');
    expect(integrations).toContain('Decision records: [ADR-002](decisions/ADR-002.md)');
    expect(plain(files['sources.md'])).toMatch(/^## INT-001$/mu);
  });
});

describe('trd.md: security and data protection', () => {
  it('RF-622 a denylist control says so, states its invariant and recommends an allowlist', () => {
    const upload = control('Upload filter');

    expect(upload).toContain('Approach: denylist. It works by listing forbidden patterns.');
    expect(upload).toContain('Invariant: No uploaded file is ever run by the server.');
    expect(upload).toContain(
      'Recommendation: Accept only a list of allowed extensions and store the files outside the web root.',
    );
    expect(upload).toContain('Decision: [ADR-003](decisions/ADR-003.md)');
  });

  it('RF-622 a denylist with no stated invariant says so and still recommends an allowlist', () => {
    const search = control('Search filter');

    expect(search).toContain('Approach: denylist. It works by listing forbidden patterns.');
    expect(search).toContain(
      'Invariant: Not stated; define what must always hold before building.',
    );
    expect(search).toContain(
      'Recommendation: Prefer an allowlist of what is permitted, or a rule that does not depend on the shape of the input, where one exists.',
    );
  });

  it('RF-622 an allowlist control carries no denylist wording, and one without a supported card is left out', () => {
    const manager = control('Manager check');

    expect(manager).toContain('Approach: allowlist.');
    expect(manager).not.toMatch(/denylist|forbidden/u);
    expect(manager).toContain('[OQ-001](sources.md#oq-001)');
    expect(section('Security and data protection')).not.toContain('Invented control');
  });
});

describe('trd.md: targets, deployment and migration', () => {
  it('RF-622 a non-functional target needs a supported source card', () => {
    const targets = section('Non-functional targets');

    expect(targets).toContain(
      '| Checkout time | 95 percent of checkouts finish within 2 seconds. | [FEAT-001](sources.md#feat-001) |',
    );
    expect(targets).not.toContain('Uptime');
  });

  it('RF-622 deployment names the hosting choice and the environments; an unknown record is no link', () => {
    const deployment = section('Deployment and environments');

    expect(deployment).toContain('Hosting: Docker on one host ([ADR-006](decisions/ADR-006.md))');
    expect(deployment).toContain('| Staging | Runs the build before a release. |');
    expect(deployment).toContain('| Production | Serves customers. |');
    expect(deployment).not.toContain('ADR-099');
    expect(deployment).toContain('Decision records: [ADR-006](decisions/ADR-006.md)');
  });

  it('RF-610 RF-622 the migration approach states the strategy, its record and the phases', () => {
    const migration = section('Migration approach');

    expect(migration).toContain('Parallel Change ([ADR-007](decisions/ADR-007.md))');
    expect(migration).toContain('Both ways work at the end of every phase.');
    expect(migration).toContain('[Phase 1](roadmap.md#phase-1): Orders first');
    expect(migration).toContain('One copy at cut-over');
    expect(migration).toContain('Decision records: [ADR-007](decisions/ADR-007.md)');
  });
});
