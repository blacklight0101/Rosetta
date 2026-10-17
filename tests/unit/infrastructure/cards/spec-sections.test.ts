import { describe, expect, it } from 'vitest';
import { transitionClaim } from '../../../../src/domain/cards/card.js';
import { cardsOf, cardTarget, fileOf, writeCards } from '../../../support/card-output-harness.js';
import { draftOf, oqDraft } from '../../../support/card-fixtures.js';
import { flowDraft, screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

// RF-263, RF-262: spec.md gets a flows section, a screens section opened by the screen map and a
// link to data-model.md, each item linking its card; data-model.md is written with the cards.

const entDraft = (title: string) => draftOf({ type: 'ENT', title });

const run = [
  {
    agentTaskId: 'task-orders',
    area: 'orders',
    drafts: [
      flowDraft(),
      screenDraft({ ...validScreen, route: '/Checkout.aspx', leadsTo: ['/Confirmation.aspx'] }),
      screenDraft({ ...validScreen, route: '/Confirmation.aspx', leadsTo: [] }),
      entDraft('Order'),
      entDraft('Customer'),
    ],
  },
];

const specOf = async (tasks = run): Promise<string> =>
  fileOf((await writeCards(cardsOf(tasks))).writer, 'spec.md');

const fences = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('```'));

describe('spec.md flows section', () => {
  it('RF-263 lists each FLOW card with a link to its file, its trigger, outcome and steps', async () => {
    const text = await specOf();

    const section = text.split('\n## Flows\n')[1]?.split('\n## Screens\n')[0] ?? '';
    expect(section).toContain('### FLOW-001 Place an order ([card file](cards/FLOW/FLOW-001.md))');
    expect(section).toContain('Trigger: The shopper presses Pay.');
    expect(section).toContain('Outcome: An order is stored and mailed.');
    expect(section).toContain('1. [Proposed] The order is saved.');
  });

  it('RF-260 the flow carries its generated sequence diagram', async () => {
    const text = await specOf();

    const section = text.split('\n## Flows\n')[1]?.split('\n## Screens\n')[0] ?? '';
    expect(section).toContain('```mermaid\nsequenceDiagram\n');
    expect(section).toContain('participant p1 as The shopper presses Pay.');
  });

  it('ADR-005 a rejected step stays in the flow, marked', async () => {
    const [flow] = cardsOf(run);
    if (flow === undefined) throw new Error('fixture');
    const verdict = {
      step: 'judgement',
      reason: 'r',
      model: 'm',
      at: '2026-10-12T10:00:00.000Z',
    } as const;
    const rejected = transitionClaim(flow, 'FLOW-001.c1', 'Rejected', verdict);
    if (!rejected.ok) throw new Error('fixture');

    const { writer } = await writeCards([rejected.value, ...cardsOf(run).slice(1)]);

    const text = fileOf(writer, 'spec.md');
    expect(text).toContain('1. [Rejected] The order is saved.');
    expect(text).toContain('The order is saved. #40;rejected#41;');
  });
});

describe('spec.md screens section', () => {
  it('RF-261 opens with the screen map, then lists each SCRN card with its link and route', async () => {
    const text = await specOf();

    const section = text.split('\n## Screens\n')[1]?.split('\n## Data model\n')[0] ?? '';
    expect(section.trimStart().startsWith('```mermaid\nflowchart LR\n')).toBe(true);
    expect(section).toContain('### SCRN-001 Checkout page ([card file](cards/SCRN/SCRN-001.md))');
    expect(section).toContain('### SCRN-002 Checkout page ([card file](cards/SCRN/SCRN-002.md))');
    expect(section).toContain('Route: /Confirmation.aspx');
  });

  it('RF-261 the map matches a leads-to route to the screen that has that route', async () => {
    const text = await specOf();

    const map = text.split('```mermaid\nflowchart LR\n')[1]?.split('```')[0] ?? '';
    expect(map).toContain('  s1["#47;Checkout.aspx"]\n  s2["#47;Confirmation.aspx"]');
    expect(map).toContain('  s1 --> s2');
    expect(map.match(/\["/g)).toHaveLength(2);
  });
});

describe('spec.md data model link', () => {
  it('RF-263 links data-model.md with the number of entities', async () => {
    const text = await specOf();

    expect(text).toContain(
      '## Data model\n\nThe legacy data model is in [data-model.md](data-model.md) (2 entities).',
    );
  });

  it('RF-262 data-model.md is written next to spec.md with one entry for each ENT card', async () => {
    const { writer, result } = await writeCards(cardsOf(run));

    expect(result.ok).toBe(true);
    const model = fileOf(writer, 'data-model.md');
    expect(model.startsWith('# Legacy data model\n')).toBe(true);
    expect(model).toContain('### ENT-001 Order ([card file](cards/ENT/ENT-001.md))');
    expect(model).toContain('### ENT-002 Customer ([card file](cards/ENT/ENT-002.md))');
    expect([...writer.files.keys()].at(-1)).toBe(`${cardTarget.folder}/data-model.md`);
  });
});

describe('a run without flows, screens or entities', () => {
  const plain = [{ agentTaskId: 't', area: 'orders', drafts: [draftOf(), oqDraft()] }];

  it('RF-263 adds no section and writes no data-model.md', async () => {
    const { writer } = await writeCards(cardsOf(plain));

    const text = fileOf(writer, 'spec.md');
    expect(text).not.toContain('## Flows');
    expect(text).not.toContain('## Screens');
    expect(text).not.toContain('## Data model');
    expect(writer.files.has(`${cardTarget.folder}/data-model.md`)).toBe(false);
  });
});

const hostile =
  'end ```\n```mermaid\n<script>x</script> [a](http://evil.example) click a href "javascript:x"';

describe('safety of the new sections', () => {
  it('RF-507 hostile flow and screen text stays literal and cannot end a fence', async () => {
    const flow = { trigger: hostile, outcome: hostile };
    const tasks = [
      {
        agentTaskId: 't',
        area: 'a',
        drafts: [
          flowDraft({ flow, title: hostile }),
          screenDraft({ ...validScreen, route: hostile, leadsTo: [hostile] }),
          entDraft(hostile),
        ],
      },
    ];

    const { writer } = await writeCards(cardsOf(tasks));

    for (const path of ['spec.md', 'data-model.md']) {
      const text = fileOf(writer, path);
      expect(text).not.toContain('<script>');
      expect(text).not.toContain('](http://evil');
      expect(fences(text).every((line) => line === '```mermaid' || line === '```')).toBe(true);
      expect(fences(text).length % 2).toBe(0);
    }
    expect(fences(fileOf(writer, 'spec.md'))).toHaveLength(4);
    expect(fences(fileOf(writer, 'data-model.md'))).toHaveLength(2);
  });
});

describe('secrets in the new sections', () => {
  it('RF-141 a secret in a flow trigger or a route is masked in the diagrams', async () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const tasks = [
      {
        agentTaskId: 't',
        area: 'a',
        drafts: [
          flowDraft({ flow: { trigger: `Key ${secret}`, outcome: 'done' } }),
          screenDraft({ ...validScreen, route: `/k/${secret}`, leadsTo: [] }),
        ],
      },
    ];

    const { writer } = await writeCards(cardsOf(tasks));

    const text = fileOf(writer, 'spec.md');
    expect(text).not.toContain(secret);
    expect(text).toContain('MASKED');
  });
});
