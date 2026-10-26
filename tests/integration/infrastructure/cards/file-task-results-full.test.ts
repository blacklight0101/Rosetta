import { describe, expect, it } from 'vitest';
import type { TaskResult } from '../../../../src/application/ports/task-results.js';
import type { AreaCoverage, SurfaceCoverage } from '../../../../src/domain/cards/area-coverage.js';
import type { Card, Claim, ClaimVerdict } from '../../../../src/domain/cards/card.js';
import { FileTaskResults } from '../../../../src/infrastructure/cards/file-task-results.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import type { DeepRequired } from '../../../support/deep-required.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-006, RF-208, RF-206, RF-250: a resumed run reports what an uninterrupted one does, so every
// field of the stored task result survives the file. The fixtures are typed `DeepRequired<...>` (every nested type too): a
// field added to a domain type fails the typecheck until it is filled here, and then this test
// fails until the stored schema keeps it.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-100000-understand' };

const cite = (startLine: number, endLine: number) => ({ path: 'src/a.cs', startLine, endLine });

const verdict: DeepRequired<ClaimVerdict> = {
  step: 'judgement',
  reason: 'The cited lines do not say it.',
  reasonKind: 'definedElsewhere',
  model: 'judge-model',
  at: '2026-10-12T10:00:00.000Z',
};

const claim: DeepRequired<Claim> = {
  claimId: 'FLOW-001.c1',
  text: 'The page validates the e-mail.',
  citations: [cite(1, 4)],
  status: 'Rejected',
  verdict,
  target: 'SCRN-001',
  branches: [{ number: 1, text: 'A blank e-mail stops the post.', citations: [cite(2, 3)] }],
  replaces: 'FLOW-000.c2',
};

const card: DeepRequired<Card> = {
  id: 'FLOW-001',
  type: 'FLOW',
  title: 'Place an order',
  summary: 'The summary.',
  area: 'orders',
  agentTaskId: 'reader-001',
  confidence: 'Medium',
  claims: [claim],
  question: 'Who may cancel?',
  whyItMatters: 'It decides the refund.',
  questionState: 'Answered',
  mergedFrom: ['FLOW-001', 'FLOW-007'],
  mergedAreas: ['orders', 'billing'],
  flow: { trigger: 'The user presses Place order.', outcome: 'The order is stored.' },
  screen: {
    route: '/Orders/Checkout.aspx',
    roles: ['Customer'],
    fields: [
      {
        name: 'Email',
        inputKind: 'text',
        required: true,
        validations: [{ text: 'Must be an e-mail.', citations: [cite(3, 3)] }],
      },
    ],
    actions: [{ label: 'Place order', handler: 'PlaceOrder_Click', flow: 'FLOW-001' }],
    leadsTo: ['/Orders/Confirm.aspx'],
  },
  note: 'Written without reading the code.',
};

const surface: DeepRequired<SurfaceCoverage> = {
  flowsMarked: true,
  screensMarked: false,
  flowCards: 1,
  screenCards: 0,
  incompleteFlows: 1,
};

const coverage: DeepRequired<AreaCoverage> = {
  area: 'orders',
  files: [{ path: 'src/a.cs', read: [{ startLine: 1, endLine: 9 }] }],
  tokens: 100,
  readTokens: 40,
  readTokenShare: 0.4,
  failure: 'invalid output (RST-1300)',
  surface,
  note: 'not read',
};

const result: DeepRequired<TaskResult> = {
  agentTaskId: 'reader-001',
  area: 'orders',
  state: 'InvalidOutput',
  turns: 3,
  withoutCards: true,
  cards: [card],
  coverage,
};

describe('FileTaskResults, every field', () => {
  const data = useTempRoot('rosetta-task-results-full-');

  it('RF-006 reads back a fully populated task result unchanged', async () => {
    const results = new FileTaskResults({
      writer: openWriter(data.path),
      masker: new SecretMasker(),
    });

    await results.write(scope, [result]);

    expect(await results.read(scope)).toEqual([result]);
  });

  it('RF-208 keeps the coverage failure and note of an area', async () => {
    const results = new FileTaskResults({
      writer: openWriter(data.path),
      masker: new SecretMasker(),
    });

    await results.write(scope, [result]);

    const [read] = await results.read(scope);
    expect(read?.coverage.failure).toBe(coverage.failure);
    expect(read?.coverage.note).toBe(coverage.note);
  });

  it('RF-250 keeps the merged areas and the note of a card', async () => {
    const results = new FileTaskResults({
      writer: openWriter(data.path),
      masker: new SecretMasker(),
    });

    await results.write(scope, [result]);

    const [read] = await results.read(scope);
    expect(read?.cards[0]?.mergedAreas).toEqual(card.mergedAreas);
    expect(read?.cards[0]?.note).toBe(card.note);
  });
});
