import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Card, Claim } from '../../../../src/domain/cards/card.js';
import type { Citation } from '../../../../src/domain/cards/citation.js';
import { writeCards } from '../../../support/card-output-harness.js';

// P3-127 / RF-141: a card file is masked once, from the card, before it is quoted or escaped, and
// the finished text is not masked again. So every string of a card must be masked by that first
// pass: ids, citation paths, verdicts, flow and screen parts included. A fake secret in every
// string field of a FLOW and a SCRN card leaves no trace in any written file, and the headers
// still parse. Mutation: rendering the unmasked card makes this test fail.

// The five shapes: a connection string password, a URL user and password, a bearer token, an
// api_key setting and a JSON password. Every fake value holds `FAKE-S<n>`.
const shapes = [
  'Server=db;User Id=sa;Password=FAKE-S1-aaaa-bbbb',
  'https://user:FAKE-S2-cccc-dddd@host.example/db',
  'Authorization: Bearer FAKE-S3-eeeeeeeeeeeeeeeeeeeeeeee',
  'api_key=FAKE-S4-ffff-gggg-hhhh',
  '{"password": "FAKE-S5-iiii-jjjj"}',
] as const;
const around = /.{0,30}FAKE-S[1-5].{0,20}/g;

/** A text that carries all five shapes, quoted the way a reason quotes a connection string. */
function dirty(label: string): string {
  return `${label} "${shapes.join('" and "')}" end`;
}

function citation(): Citation {
  return { path: 'cfg/api_key=FAKE-S4-kkkk-llll.cs', startLine: 1, endLine: 2 };
}

function cited(label: string) {
  return { text: dirty(label), citations: [citation()] };
}

function claim(card: string, extra: Partial<Claim> = {}): Claim {
  return {
    claimId: `${card}.c1`,
    ...cited('claim'),
    status: 'Rejected',
    verdict: {
      step: 'judgement',
      reason: dirty('reason'),
      model: dirty('model'),
      at: dirty('at'),
    },
    ...extra,
  };
}

const base = {
  title: dirty('title'),
  summary: dirty('summary'),
  area: dirty('area'),
  agentTaskId: dirty('task'),
  confidence: 'High',
  note: dirty('note'),
  mergedFrom: [dirty('merged from')],
  mergedAreas: [dirty('merged area')],
} as const;

const flow: Card = {
  ...base,
  id: 'FLOW-001',
  type: 'FLOW',
  claims: [
    claim('FLOW-001', {
      target: dirty('target'),
      replaces: dirty('replaces'),
      branches: [{ number: 1, ...cited('branch') }],
    }),
  ],
  flow: { trigger: dirty('trigger'), outcome: dirty('outcome') },
};

const screen: Card = {
  ...base,
  id: 'SCRN-001',
  type: 'SCRN',
  claims: [claim('SCRN-001')],
  screen: {
    route: dirty('route'),
    roles: [dirty('role')],
    fields: [
      {
        name: dirty('field'),
        inputKind: dirty('kind'),
        required: true,
        validations: [cited('validation')],
      },
    ],
    actions: [{ label: dirty('label'), handler: dirty('handler'), flow: dirty('action flow') }],
    leadsTo: [dirty('leads to')],
  },
};

describe('P3-127 every string of a card is masked before it is written', () => {
  it('RF-141 a FLOW and a SCRN card with a fake secret in every field leave none in any file', async () => {
    const { writer } = await writeCards([flow, screen]);

    expect(writer.files.size).toBeGreaterThan(2);
    for (const [path, text] of writer.files)
      expect([path, text.match(around)]).toEqual([path, null]);
  });

  it('the headers of both card files still parse', async () => {
    const { writer } = await writeCards([flow, screen]);
    const cards = [...writer.files].filter(([path]) => /cards\/(FLOW|SCRN)\/.*\.md$/.test(path));

    expect(cards).toHaveLength(2);
    for (const [path, text] of cards) {
      const head = text.split('\n---\n')[0]?.replace(/^---\n/, '') ?? '';
      expect([path, typeof parse(head)]).toEqual([path, 'object']);
    }
  });
});
