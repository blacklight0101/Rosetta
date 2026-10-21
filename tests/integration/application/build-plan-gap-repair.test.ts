import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { separateFrontEnd } from '../../support/api-plan-harness.js';
import { gapRecordingOfAll, objectPositionsGapRecording } from '../../support/gap-plan-harness.js';
import {
  answerOf,
  card,
  gappedPlan as gappedPlanIn,
  messageOf,
  operations,
  plain,
  rest,
  sentinel,
} from '../../support/gap-repair-fixtures.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-54, Q-45, RF-627, RF-630, RF-202, ADR-013, ADR-008: a small model writes the positions of its
// task cards as objects; they are read. A card that still cannot be read is logged with its position
// and the field, and when it named a gap the planner gets one repair attempt through the same
// guards. Recorded responses only: tests/recordings/fake/planner-gap-positions.json and the answers
// written here.

const temp = useTempRoot('rosetta-gap-repair-');

const gappedPlan = (gap: Parameters<typeof gappedPlanIn>[1]) => gappedPlanIn(temp.path, gap);

const unreadable = card(sentinel, rest, { requirements: [{ position: '3' }] });
const fixed = card('The journey and its screens', rest, { requirements: [{ position: 3 }] });

describe('BuildPlan: the recorded answer of a small model that writes positions as objects', () => {
  it('Q-54 RF-627 keeps the five cards and completes with no gap, without a repair call', async () => {
    const h = await gappedPlan(await objectPositionsGapRecording());

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    const written = await h.handoffOf(run);
    const cards = plain(written['tasks.md']).split(/^## /mu).slice(1);
    expect(cards.map((each) => each.split('\n')[0])).toEqual([
      ...['T-001', 'T-002', 'T-003', 'T-004', 'T-005', 'T-006', 'T-007', 'T-008'],
    ]);
    expect(plain(written['checks.md'])).toContain('Every item is built by at least one task card.');
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).not.toContain('of the gap');
  });

  it('Q-54 RF-634 the dependsOn objects are read as the positions of the cards of the answer', async () => {
    const h = await gappedPlan(await objectPositionsGapRecording());

    const written = await h.handoffOf(await h.plan());

    const cards = plain(written['tasks.md']).split(/^## /mu);
    const byId = (id: string): string => cards.find((each) => each.startsWith(id)) ?? '';
    expect(byId('T-005')).toContain('Depends on: [T-004]');
    expect(byId('T-007')).toContain('Depends on: [T-004]');
    expect(byId('T-008')).toContain('Depends on: [T-007]');
  });
});

describe('BuildPlan: a card that cannot be read is logged', () => {
  const broken = (title: string, requirements: unknown, builds: string[]) =>
    card(title, builds, { requirements });

  it('Q-54 { "position": "3" } and { "id": 3 } are refused, and the log names the position and the field', async () => {
    const answer = answerOf(
      card('Operations', operations),
      broken(sentinel, [{ position: '3' }], ['flow:FLOW-001']),
      broken(`${sentinel}-2`, [{ id: 3 }], ['screen:SCRN-001', 'screen:SCRN-003']),
    );
    const h = await gappedPlan(gapRecordingOfAll(answer, '{"tasks": []}'));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const left = warned.map((entry) => entry.message).filter((text) => text.includes('of the gap'));
    expect(left).toHaveLength(2);
    expect(left[0]).toMatch(/position 2 of the gap answer.*field "requirements"/u);
    expect(left[1]).toMatch(/position 3 of the gap answer.*field "requirements"/u);
    expect(plain((await h.handoffOf(run))['tasks.md'])).not.toContain(sentinel);
  });

  it('Q-54 ADR-013 the log holds no text of the answer, in any entry', async () => {
    const answer = answerOf(card('Operations', operations), {
      ...card(sentinel, ['flow:FLOW-001']),
      requirements: [{ id: sentinel }],
    });
    const h = await gappedPlan(gapRecordingOfAll(answer, '{"tasks": []}'));

    await h.plan();

    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
    const request = h.providers.gapRequests()[1];
    expect(messageOf(request)).not.toContain(sentinel);
  });

  it('Q-54 a card that is not an object is logged as the card itself', async () => {
    const answer = answerOf(card('Operations', operations), 'a text instead of a card');
    const h = await gappedPlan(gapRecordingOfAll(answer));

    await h.plan();

    const left = h.s.logger.entries.filter((entry) => entry.message.includes('of the gap'));
    expect(left.map((entry) => entry.message).join(' ')).toMatch(/position 2.*field "card"/u);
    expect(h.providers.gapRequests()).toHaveLength(1);
  });
});

describe('BuildPlan: the repair attempt', () => {
  it('Q-54 RF-202 an answer with one unreadable card gets one repair, and its fixed card is kept', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(fixed)));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    const tasks = plain((await h.handoffOf(run))['tasks.md']);
    expect(tasks).toContain('Operations');
    expect(tasks).toContain('The journey and its screens');
    expect(tasks).not.toContain(sentinel);
    expect(tasks).toMatch(/^## T-005\n/mu);
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });

  it('Q-54 the repair lists the problems and the items still uncovered, with the gap prompt as system', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(fixed)));

    await h.plan();

    const [, repair] = h.providers.gapRequests();
    const message = messageOf(repair);
    expect(message).toContain('Card 2: the field "requirements"');
    for (const id of rest) expect(message).toContain(`"id": "${id}"`);
    for (const done of ['operation:placeOrder', 'feature:F-002']) {
      expect(message).not.toContain(`"id": "${done}"`);
    }
    expect(message).toContain('"title": "Operations"');
    const repairPrompt = await readFile('prompts/planner/gap-repair.v1.md', 'utf8');
    expect(message).toContain(repairPrompt.trim().split('\n')[0]);
    expect(repair?.system).toBe(await readFile('prompts/planner/gap.v1.md', 'utf8'));
    expect(repair?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-gap' });
    expect(message).not.toContain(sentinel);
  });
});

describe('BuildPlan: the repair attempt is a call like the others', () => {
  it('Q-54 RNF-004 every call has its own number and the manifest records the repair prompt', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(fixed)));

    const manifest = await h.manifestOf(await h.plan());

    const all = [
      ...h.providers.requests(),
      ...h.providers.coverageRequests(),
      ...h.providers.gapRequests(),
    ];
    expect(new Set(all.map((each) => each.context.callId)).size).toBe(9);
    expect(Object.keys(manifest.promptVersions)).toEqual(
      expect.arrayContaining(['planner/gap.v1.md', 'planner/gap-repair.v1.md']),
    );
  });
});

describe('BuildPlan: a repair that does not fix the answer', () => {
  it('Q-54 RST-1806 a repair that still fails reports the gaps as before, and asks no third time', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const again = answerOf(card(`${sentinel}-again`, rest, { requirements: [{ id: 3 }] }));
    const h = await gappedPlan(gapRecordingOfAll(first, again));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({
        code: 'RST-1806',
        message: 'The package was written, but 3 item(s) are built by no task card; see checks.md.',
      }),
    );
    const left = h.s.logger.entries.filter((entry) => entry.message.includes('of the gap'));
    expect(left.map((entry) => entry.message)).toEqual([
      expect.stringMatching(/position 2 of the gap answer/u),
      expect.stringMatching(/position 1 of the gap repair answer.*field "requirements"/u),
    ]);
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Operations');
  });

  it('Q-54 a repair answer that is no task cards reports the gaps as before and is logged as unreadable', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const h = await gappedPlan(gapRecordingOfAll(first, 'Sorry, I cannot.'));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).toContain('could not be read');
  });

  it('Q-54 the repair cards under SDD still need a requirement', async () => {
    const first = answerOf(card('Operations', operations), unreadable);
    const bare = card('The journey', rest, { requirements: [] });
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(bare)));
    await h.saveBrief({ ...separateFrontEnd, principles: ['sdd'] });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(plain((await h.handoffOf(run))['tasks.md'])).not.toContain('The journey');
  });
});

describe('BuildPlan: when no repair is asked', () => {
  it('Q-54 a left-out card that names no gap asks for no repair', async () => {
    const answer = answerOf(
      card('Everything', [...operations, ...rest]),
      card('Nothing', ['feature:F-001', 'operation:ghost'], { requirements: [{ id: 1 }] }),
    );
    const h = await gappedPlan(gapRecordingOfAll(answer));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
  });

  it('Q-54 a left-out card that names a gap another card builds asks for no repair', async () => {
    const answer = answerOf(
      card('Everything', [...operations, ...rest]),
      card('Again', ['flow:FLOW-001'], { requirements: [{ id: 1 }] }),
    );
    const h = await gappedPlan(gapRecordingOfAll(answer));

    await h.plan();

    expect(h.providers.gapRequests()).toHaveLength(1);
  });

  it('Q-54 an answer with nothing left out asks for no repair, whatever gaps remain', async () => {
    const h = await gappedPlan(gapRecordingOfAll(answerOf(card('Operations', operations))));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.gapRequests()).toHaveLength(1);
  });
});
