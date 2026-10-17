import { expect } from 'vitest';
import type { LlmRequest } from '../../src/application/ports/llm-provider.js';
import { assignCardIds, type CardDraft } from '../../src/domain/cards/card-ids.js';
import type { Card } from '../../src/domain/cards/card.js';
import { scanDataBlocks } from '../../src/domain/egress/data-block-scan.js';
import { DATA_BLOCK_OPEN } from '../../src/domain/egress/data-block.js';
import { draftOf } from './card-fixtures.js';

// RF-301: the cards whose claims the verifier recordings judge, and a reader of the data blocks a
// judgement request sends.

/** One claim citing one range of a fixture file. */
function claimOf(text: string, citation: string): CardDraft['claims'][number] {
  const [path = '', range = ''] = citation.split(':');
  const [startLine, endLine] = range.split('-').map(Number);
  return { text, citations: [{ path, startLine: startLine ?? 0, endLine: endLine ?? 0 }] };
}

function draft(type: CardDraft['type'], area: string, text: string, citation: string): CardDraft {
  const question =
    type === 'OQ' ? { question: 'Is an item with zero stock shown?', whyItMatters: 'Parity.' } : {};
  return draftOf({ type, area, claims: [claimOf(text, citation)], ...question });
}

/**
 * The five claims of the recorded understand run that pass the citation check, in card order:
 * FEAT-001.c1, OQ-001.c1, BR-001.c1, ENT-001.c1 and BR-002.c1.
 */
export function fixtureCards(): readonly Card[] {
  const root = [
    draft('FEAT', '(root)', 'The page loads every catalog item.', 'Default.aspx.cs:8-12'),
    draft('OQ', '(root)', 'The page shows what List returns.', 'Default.aspx.cs:10-10'),
  ];
  const single = (agentTaskId: string, area: string, card: CardDraft) => ({
    ...{ agentTaskId, area },
    drafts: [card],
  });
  const tasks = [
    { agentTaskId: 'reader-001', area: '(root)', drafts: root },
    single(
      'reader-002',
      'Catalog',
      draft('BR', 'Catalog', 'The name label is set to Item.', 'Catalog/Details.aspx.cs:5-8'),
    ),
    single(
      'reader-003',
      'Database',
      draft('ENT', 'Database', 'CatalogItem has Id, Name, Price.', 'Database/schema.sql:2-6'),
    ),
    single(
      'reader-004',
      'Services',
      draft('BR', 'Services', 'Stock goes down by one.', 'Services/CatalogService.cs:12-12'),
    ),
  ];
  const cards = assignCardIds(tasks);
  if (!cards.ok) throw new Error('The fixture cards are invalid.');
  return cards.value;
}

/** The content of each data block of the request's first message, in order. */
export function blockTexts(request: LlmRequest | undefined): string[] {
  const first = request?.messages[0];
  if (first?.role !== 'user') throw new Error('The first message is not the user message.');
  const scan = scanDataBlocks(first.content);
  if (!scan.ok) throw new Error('The message holds a broken data block.');
  expect(scan.value.textOutside).toBe(false);
  const { parts } = scan.value;
  return parts
    .filter((part, index) => !part.frame && parts[index - 1]?.text.startsWith(DATA_BLOCK_OPEN))
    .map((part) => part.text);
}

/** The excerpts the data blocks of the request's first message name, in order. */
export function blockExcerpts(request: LlmRequest | undefined): unknown {
  const first = request?.messages[0];
  if (first?.role !== 'user') return undefined;
  const scan = scanDataBlocks(first.content);
  return scan.ok ? scan.value.excerpts : undefined;
}
