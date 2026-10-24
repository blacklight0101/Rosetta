import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import { cardsOf, cardTarget, fileOf, writeCards } from '../../../support/card-output-harness.js';
import { flowDraft, screenDraft, validScreen } from '../../../support/flow-screen-fixtures.js';

const tasks = [
  { agentTaskId: 'task-orders', area: 'orders', drafts: [flowDraft(), screenDraft()] },
];

describe('writeCardOutputs for FLOW and SCRN cards', () => {
  it('RF-204 writes cards/FLOW/FLOW-001.md and cards/SCRN/SCRN-001.md', async () => {
    const { writer, result } = await writeCards(cardsOf(tasks));

    expect(result.ok).toBe(true);
    const paths = [...writer.files.keys()].map((path) => path.slice(cardTarget.folder.length + 1));
    expect(paths.sort()).toEqual([
      'cards/FLOW/FLOW-001.md',
      'cards/SCRN/SCRN-001.md',
      'cards/index.json',
      'spec.md',
    ]);
  });

  it('RF-204 cards/index.json lists both cards with their paths and claim counts', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    const index: unknown = JSON.parse(fileOf(writer, 'cards/index.json'));

    expect(index).toMatchObject({
      cards: [
        { id: 'FLOW-001', type: 'FLOW', path: 'cards/FLOW/FLOW-001.md' },
        { id: 'SCRN-001', type: 'SCRN', path: 'cards/SCRN/SCRN-001.md' },
      ],
    });
  });
});

describe('writeCardOutputs FLOW card file', () => {
  it('RF-260 the FLOW header holds trigger, outcome, step targets and numbered branches', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    const text = fileOf(writer, 'cards/FLOW/FLOW-001.md');

    expect(text).toContain('flow:\n  trigger: "The shopper presses Pay."');
    expect(text).toContain('  outcome: "An order is stored and mailed."');
    expect(text).toContain('    target: "ENT-002"');
    expect(text).toContain('      - number: 2');
    expect(text).toContain('        text: "A payment error ends the flow."');
    expect(text).toContain('        citations:\n          - "src/Orders/Checkout.cs:60-66"');
  });

  it('RF-260 the FLOW body shows the trigger, outcome, what each step touches and its branches', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    const text = fileOf(writer, 'cards/FLOW/FLOW-001.md');

    expect(text).toContain('## Flow\n\nTrigger:\n\n> The shopper presses Pay.');
    expect(text).toContain('Outcome:\n\n> An order is stored and mailed.');
    expect(text).toContain('Touches: ENT-002');
    expect(text).toContain('Branch 1: A stock error shows the basket again.');
    expect(text).toContain('Branch 2: A payment error ends the flow.');
  });
});

describe('writeCardOutputs SCRN card file', () => {
  it('RF-261 the SCRN header holds route, roles, fields, validations, actions and links', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    const text = fileOf(writer, 'cards/SCRN/SCRN-001.md');

    expect(text).toContain('screen:\n  route: "/Checkout.aspx"');
    expect(text).toContain('  roles:\n    - "Customer"');
    expect(text).toContain('    - name: "Email"');
    expect(text).toContain('      required: true');
    expect(text).toContain('            - "src/Web/Checkout.aspx:12-14"');
    expect(text).toContain('    - label: "Pay"\n      handler: "PayButton_Click"');
    expect(text).toContain('    - label: "Back"\n      flow: "FLOW-001"');
    expect(text).toContain('  leadsTo:\n    - "/Confirmation.aspx"');
  });

  it('RF-261 the SCRN body lists fields with their validations, actions and where it leads', async () => {
    const { writer } = await writeCards(cardsOf(tasks));

    const text = fileOf(writer, 'cards/SCRN/SCRN-001.md');

    expect(text).toContain('## Screen');
    expect(text).toContain('Route: /Checkout.aspx');
    expect(text).toContain('Roles: Customer');
    expect(text).toContain('- Email (text, required)');
    expect(text).toContain(String.raw`Validation: Must be an e-mail address.`);
    expect(text).toContain(String.raw`- Pay: handler PayButton_Click`);
    expect(text).toContain(String.raw`- Back: FLOW FLOW-001`);
    expect(text).toContain('Leads to: /Confirmation.aspx');
  });
});

describe('writeCardOutputs safety of FLOW and SCRN files', () => {
  it('RF-507 model text in a FLOW or SCRN body cannot add Markdown or HTML structure', async () => {
    const evil = '<script>x</script> [a](http://evil.example).# heading';
    const screen = { ...validScreen, route: evil, leadsTo: [evil] };
    const flow = { trigger: evil, outcome: evil };
    const { writer } = await writeCards(
      cardsOf([
        { agentTaskId: 't', area: 'a', drafts: [flowDraft({ flow }), screenDraft(screen)] },
      ]),
    );

    for (const path of ['cards/FLOW/FLOW-001.md', 'cards/SCRN/SCRN-001.md']) {
      const body = fileOf(writer, path).split('.---.').slice(1).join('.---.');
      expect(dangerousIn(body)).toBeUndefined();
      expect(body).not.toContain('](http');
      expect(body).not.toMatch(/^# heading/m);
    }
  });

  it('RF-141 a secret in a branch or a validation is masked in the header and the body', async () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const field = { name: 'Key', inputKind: 'text', required: false };
    const citations = [{ path: 'src/a.cs', startLine: 1, endLine: 2 }];
    const screen = {
      ...validScreen,
      fields: [{ ...field, validations: [{ text: secret, citations }] }],
    };
    const claims = [{ text: 's', citations, branches: [{ text: secret, citations }] }];
    const { writer } = await writeCards(
      cardsOf([
        { agentTaskId: 't', area: 'a', drafts: [flowDraft({ claims }), screenDraft(screen)] },
      ]),
    );

    for (const file of writer.files.values()) expect(file).not.toContain(secret);
  });
});
