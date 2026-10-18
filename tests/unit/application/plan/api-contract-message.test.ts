import { describe, expect, it } from 'vitest';
import { apiContractMessage } from '../../../../src/application/plan/api-contract-message.js';
import { apiCards, briefWithFrontEnd } from '../../../support/api-contract-fixtures.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-624, RF-145, ADR-013: what the planner is given to write the API contract. The verified FEAT
// and FLOW cards with their supported claims, the entity cards by id and title, and the owner's
// stack choices, each in a data block with a tag of its own; nothing of them is in the system prompt.

function tagsOf(): () => string {
  const ids = new SequenceIdGenerator();
  return () => ids.dataBlockTag();
}

function message(): string {
  return apiContractMessage({ cards: apiCards(), brief: briefWithFrontEnd('React') }, tagsOf());
}

describe('apiContractMessage', () => {
  it('RF-624 sends the feature and flow cards with their claim ids, text and citations', () => {
    const text = message();

    for (const sent of [
      'FEAT-001',
      'FEAT-001.c1',
      'Place an order.',
      'FLOW-001.c1',
      'src/Orders/Checkout.cs:3-9',
    ]) {
      expect(text).toContain(sent);
    }
  });

  it('RF-624 names the entity cards by id and title only, so an operation can pick its body', () => {
    const text = message();

    expect(text).toContain('ENT-001');
    expect(text).toContain('"title": "Customer"');
    expect(text).not.toContain('ENT-001.c1');
  });

  it('RF-624 sends the front end and the back end the owner chose', () => {
    expect(message()).toContain('"frontEnd": "React"');
    expect(message()).toContain('"backEnd": null');
  });
});

describe('apiContractMessage: what is left out and how it is wrapped', () => {
  it('RF-624 sends only claims the verifier supported', () => {
    const [feature, ...rest] = apiCards();
    if (feature === undefined) throw new Error('The fixture has cards');
    const claims = [
      ...feature.claims,
      {
        claimId: 'FEAT-001.c2',
        text: 'Rejected text.',
        citations: [],
        status: 'Rejected' as const,
      },
    ];

    const text = apiContractMessage(
      { cards: [{ ...feature, claims }, ...rest], brief: briefWithFrontEnd('React') },
      tagsOf(),
    );

    expect(text).not.toContain('Rejected text.');
  });

  it('RF-145 puts the cards and the owner choices in two data blocks with different tags', () => {
    const scan = scanDataBlocks(message());

    expect(scan.ok && scan.value.blocks).toBe(2);
    expect(scan.ok && new Set(scan.value.tags).size).toBe(2);
    expect(scan.ok && scan.value.textOutside).toBe(false);
  });
});
