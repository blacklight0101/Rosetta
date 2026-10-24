import { readFile } from 'node:fs/promises';
import { dangerousIn } from '../../support/render-markdown.js';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import {
  packageFiles as files,
  plain,
  seedFlowsRun,
  withPlanAnswer,
} from '../../support/plan-flows-run.js';
import { customerCard, planCards } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-625, RF-620, Q-27, ADR-008: the target flows of the hand-off package from a plan run over a
// seeded understand run with FLOW cards, real files in a temporary data folder and the real
// provider factory. The planner's fourth call replays the flows in
// tests/recordings/fake/planner-package.json.

const temp = useTempRoot('rosetta-flows-');
/** The text of the plan answer in the recording, without its fence. */
async function planText(): Promise<string> {
  const base = await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json'));
  const first = base.calls[0]?.attempts[0];
  if (first === undefined || !('response' in first)) throw new Error('The recording has a plan');
  return first.response.text.replace(/^```json\n/u, '').replace(/\n```$/u, '');
}

const seeded = (
  ...args: Parameters<typeof seedFlowsRun> extends [string, ...infer R] ? R : never
) => seedFlowsRun(temp.path, ...args);

describe('BuildPlan: what the flows call is sent', () => {
  it('RF-625 sends the verified FLOW cards with their supported steps and the plan components', async () => {
    const h = await seeded();

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const request = h.providers.requests()[3];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    for (const sent of [
      'FLOW-001.c1',
      'The checkout page posts the basket.',
      'The customer presses Pay on the checkout page.',
      '"touches": "ENT-001"',
      'FLOW-003.c1',
      '"name": "Web front end"',
      '"name": "Order service"',
      'src/Orders/Checkout.cs:3-9',
    ]) {
      expect(message).toContain(sent);
    }
    for (const left of ['warehouse is emailed', 'FLOW-004', 'Print sends', 'INT-009', 'ENT-002']) {
      expect(message).not.toContain(left);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/flows.v2.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-flows' });
    const callIds = h.providers.requests().map((each) => each.context.callId);
    expect(new Set(callIds).size).toBe(4);
  });
});

describe('BuildPlan: when there is nothing to map', () => {
  it('RF-625 without a verified FLOW card the flows are not asked for and the index says so', async () => {
    const h = await seeded(undefined, {}, [...planCards(), customerCard()]);

    const written = await files(h);

    expect(h.providers.requests()).toHaveLength(3);
    expect(Object.keys(written).filter((name) => name.startsWith('flows/'))).toEqual([
      'flows/README.md',
    ]);
    expect(written['flows/README.md']).toContain('No journey is mapped.');
  });

  it('RF-625 an architecture without a component is not asked either and lists every journey as out of scope', async () => {
    const plan = z.record(z.string(), z.unknown()).parse(JSON.parse(await planText()));
    const recording = await withPlanAnswer(JSON.stringify({ ...plan, components: [] }));
    const h = await seeded(recording);

    const written = await files(h);

    expect(h.providers.requests()).toHaveLength(3);
    const index = plain(written['flows/README.md'] ?? '');
    expect(index.match(/no component/gu)).toHaveLength(3);
    expect(Object.keys(written).filter((name) => name.startsWith('flows/FLOW'))).toEqual([]);
  });
});

describe('BuildPlan: flows/', () => {
  it('RF-625 writes one file per main journey, linking its legacy FLOW card, and none for the others', async () => {
    const written = await files(await seeded());

    expect(Object.keys(written).filter((name) => name.startsWith('flows/'))).toEqual([
      'flows/FLOW-001.md',
      'flows/README.md',
    ]);
    const file = plain(written['flows/FLOW-001.md'] ?? '');
    expect(file).toContain('Legacy flow card: [FLOW-001](../sources.md#flow-001)');
    expect(file).toContain('Place an order');
    expect(file).toContain('Trigger: The customer presses Pay on the checkout page.');
    expect(file).toContain('Outcome: The order is stored and the customer sees a receipt.');
  });

  it('RF-625 maps each supported step to a target component of the architecture', async () => {
    const file = plain((await files(await seeded()))['flows/FLOW-001.md'] ?? '');

    expect(file).toContain(
      '| 1 | FLOW-001.c1: The checkout page posts the basket. | [FEAT-001](../sources.md#feat-001) | Web front end |',
    );
    expect(file).toContain(
      '| 2 | FLOW-001.c2: The order is saved with its lines. | [ENT-001](../sources.md#ent-001) | Order service | Creates the order and totals the lines. |',
    );
    expect(file).toContain('| 3 | FLOW-001.c3: The payment is taken. | none | not mapped |');
    expect(file).toContain('did not support and so left out: FLOW-001.c4.');
  });
});

describe('BuildPlan: flows/ diagram and index', () => {
  it('RF-625 the sequence diagram is generated by code from the checked steps', async () => {
    const file = (await files(await seeded()))['flows/FLOW-001.md'] ?? '';

    const diagram = file.split('```mermaid\n')[1]?.split('```')[0] ?? '';
    expect(diagram.split('\n')[0]).toBe('sequenceDiagram');
    expect(diagram).toContain('participant p2 as Web front end');
    expect(diagram).toContain('participant p3 as Order service');
    expect(diagram).toMatch(/^ {2}p2->>p3: 2\. Creates the order and totals the lines\.$/mu);
    expect(diagram).not.toMatch(/Payment gateway|warehouse|Repeats a step|another card/u);
    expect(file.match(/^```.*$/gmu)).toEqual(['```mermaid', '```']);
  });

  it('RF-625 every verified FLOW card is mapped or listed as out of scope, with its legacy card', async () => {
    const index = plain((await files(await seeded()))['flows/README.md'] ?? '');

    const mapped = [...index.matchAll(/^- \[(FLOW-\d+)\]/gmu)].map((match) => match[1]);
    const listed = [...index.matchAll(/^\| \[(FLOW-\d+)\]/gmu)].map((match) => match[1]);
    expect([...mapped, ...listed].sort()).toEqual(['FLOW-001', 'FLOW-002', 'FLOW-003']);
    expect(index).toContain(
      '| [FLOW-002](../sources.md#flow-002) | Export orders | The staff export is not part of the new shop. |',
    );
    expect(index).toMatch(/\| \[FLOW-003\].*neither mapped nor left out/u);
    expect(index).not.toContain('FLOW-004');
    expect(index).not.toContain('FLOW-077');
  });
});

describe('BuildPlan: flows/ and the package', () => {
  it('RF-620 the package README lists the flows after the data model and links the index', async () => {
    const written = await files(await seeded());

    const readme = written['README.md'] ?? '';
    expect(readme).toContain('](flows/README.md)');
    expect(readme.indexOf('](data-model.md)')).toBeLessThan(readme.indexOf('](flows/README.md)'));
    expect(readme.indexOf('](flows/README.md)')).toBeLessThan(readme.indexOf('](requirements.md)'));
  });

  it('RF-625 the model text adds no HTML or link, and the log names what the checks refused', async () => {
    const h = await seeded();
    const written = await files(h);

    const file = written['flows/FLOW-001.md'] ?? '';
    expect(dangerousIn(file)).toBeUndefined();
    expect(file).toContain('\\<img');
    const warned = h.s.logger.entries
      .filter((entry) => entry.level === 'warn')
      .map((entry) => entry.message)
      .join(' ');
    expect(warned).toContain('1 journey(s) without a verified FLOW card and 4 step(s)');
  });
});
