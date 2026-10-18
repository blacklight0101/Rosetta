import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  apiFiles,
  plain,
  seededApiPlan,
  separateFrontEnd,
  withApiAnswer,
} from '../../support/api-plan-harness.js';
import { customerCard, featureCardSaying, flowCard, planCards } from '../../support/plan-cards.js';
import { fakeOpenAiKey } from '../../support/secret-fixture.js';

// RF-624, RF-623, RF-603, ADR-008: the planner's fifth call, the API contract, from a plan run over a
// seeded understand run with FEAT, FLOW and ENT cards, real files in a temporary data folder and the
// real provider factory. The call is made only when the brief names a front end and a FEAT or FLOW
// card is verified; an answer that gives no contract does not fail the run.

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-api-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: what the API contract call is sent', () => {
  it('RF-624 sends the verified FEAT and FLOW cards, the entity cards and the stack as a fifth call', async () => {
    const h = await seededApiPlan(dataDir);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const request = h.providers.requests()[4];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    for (const sent of ['FEAT-001.c1', 'FLOW-001.c2', '"frontEnd": "React"', '"id": "ENT-002"']) {
      expect(message).toContain(sent);
    }
    for (const left of ['Staff export', 'FEAT-002', 'keeps the card number', 'A customer has']) {
      expect(message).not.toContain(left);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/api-contract.v1.md', 'utf8'));
    expect(request?.context).toMatchObject({
      role: 'planner',
      agentTaskId: 'planner-api-contract',
    });
    const callIds = h.providers.requests().map((each) => each.context.callId);
    expect(new Set(callIds).size).toBe(5);
  });
});

describe('BuildPlan: when the API contract is not asked for', () => {
  it('RF-624 without a front end in the brief there is no call and the README says so', async () => {
    const h = await seededApiPlan(dataDir, { brief: { ...separateFrontEnd, stack: [] } });

    const written = await h.handoffOf(await h.plan());

    expect(h.providers.requests()).toHaveLength(4);
    expect(apiFiles(written)).toEqual([]);
    expect(plain(written['README.md'])).toContain('names no front end');
  });

  it('RF-624 without a verified FEAT or FLOW card there is no call and the README says so', async () => {
    const cards = [...planCards(), customerCard()].filter((card) => card.type !== 'FEAT');
    const h = await seededApiPlan(dataDir, { cards });

    const written = await h.handoffOf(await h.plan());

    expect(h.providers.requests()).toHaveLength(3);
    expect(plain(written['README.md'])).toContain('no verified feature or flow');
  });
});

describe('BuildPlan: an answer that gives no contract', () => {
  it('RF-624 an answer that says the pages are server-rendered writes no file and gives the reason', async () => {
    const reason = 'The pages are rendered by the server and no public API exists.';
    const recording = await withApiAnswer(JSON.stringify({ applies: false, reason }));
    const h = await seededApiPlan(dataDir, { recording });

    const written = await h.handoffOf(await h.plan());

    expect(apiFiles(written)).toEqual([]);
    expect(plain(written['README.md'])).toContain(reason);
    expect(plain(written['README.md'])).not.toContain('openapi.yaml');
  });

  it('RF-624 an unusable answer still completes, says so in the README and logs a warning', async () => {
    const recording = await withApiAnswer('I cannot answer that.');
    const h = await seededApiPlan(dataDir, { recording });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const written = await h.handoffOf(run);
    expect(apiFiles(written)).toEqual([]);
    expect(plain(written['README.md'])).toContain('no usable operation');
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).toContain('API contract');
  });

  it('RF-624 an answer whose every operation the checks refuse is treated the same way', async () => {
    const operation = { operationId: 'bad id', method: 'get', path: '/x', summary: 'No.' };
    const answer = JSON.stringify({ operations: [{ ...operation, serves: ['FEAT-001'] }] });
    const h = await seededApiPlan(dataDir, { recording: await withApiAnswer(answer) });

    const written = await h.handoffOf(await h.plan());

    expect(apiFiles(written)).toEqual([]);
    expect(plain(written['README.md'])).toContain('no usable operation');
  });
});

describe('BuildPlan: a stop during the API contract call', () => {
  it('RF-1108 a run stopped during the fifth call ends Interrupted with no package', async () => {
    let calls = 0;
    const beforeCall = async (harness: { stopRunning(): Promise<void> }): Promise<void> => {
      calls += 1;
      if (calls === 5) await harness.stopRunning();
    };
    const h = await seededApiPlan(dataDir, { harness: { beforeCall } });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
  });
});

describe('BuildPlan: a secret in a FEAT card', () => {
  it('RNF-003 RF-624 never reaches the API contract call or the files', async () => {
    const text = `Placing an order needs the token ${fakeOpenAiKey}.`;
    const cards = [...planCards(), customerCard(), flowCard(), featureCardSaying('FEAT-050', text)];
    const h = await seededApiPlan(dataDir, { cards });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const request = h.providers.requests()[4];
    const sent = request?.messages.map((each) => each.content).join(' ');
    expect(sent).toContain('Placing an order needs the token');
    expect(sent).not.toContain(fakeOpenAiKey.slice(8, 30));
    const written = Object.values(await h.handoffOf(run)).join(' ');
    expect(written).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});
