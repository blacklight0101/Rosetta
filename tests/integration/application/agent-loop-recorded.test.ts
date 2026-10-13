import { describe, expect, it } from 'vitest';
import { scanDataBlocks } from '../../../src/domain/egress/data-block-scan.js';
import { holdsDataMarker } from '../../../src/domain/egress/data-block.js';
import { assignCardIds } from '../../../src/domain/cards/card-ids.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { runRecordedAgent } from '../../support/agent-harness.js';
import { securityCodes } from '../../support/reader-harness.js';

// RF-201, RF-145, ADR-003, ADR-008, ADR-013: reader agent tasks over fixture repositories on disk,
// with the real prompt files and tools, replaying hand-written recordings through the egress guard.

describe('reader agent task with recorded responses', () => {
  it('RF-201 reads a normal area through the egress guard and returns its cards', async () => {
    const { result, egress } = await runRecordedAgent({
      fixture: 'webforms-csharp',
      recording: 'reader-normal-area.json',
      area: 'Services',
    });

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(3);
    expect(result.drafts.map((draft) => draft.title)).toEqual([
      'Stock goes down by one per update',
    ]);
    expect(egress.fake.requests).toHaveLength(3);
    const lines = await egress.egressLines();
    expect(lines.at(-1)).toMatchObject({
      excerpts: [{ path: 'Services/CatalogService.cs', startLine: 1, endLine: 18 }],
    });
  });

  it('RF-201 a bad tool call gets an error result the model corrects', async () => {
    const { result, egress, logger } = await runRecordedAgent({
      fixture: 'webforms-csharp',
      recording: 'reader-bad-tool-call.json',
      area: 'Services',
    });

    expect(result.state).toBe('Done');
    expect(result.toolErrors).toBe(1);
    const error = egress.fake.requests[1]?.messages.find((message) => message.role === 'tool');
    expect(error?.content).toContain('startLine');
    expect(logger.entries.map((entry) => entry.code)).toContain(ERROR_CODES.toolArgumentsInvalid);
  });
});

describe('reader agent task limits and planted instructions', () => {
  it('RF-201 ends at the turn limit with the task marked TurnLimitReached', async () => {
    const { result, egress } = await runRecordedAgent({
      fixture: 'webforms-csharp',
      recording: 'reader-turn-limit.json',
      area: 'Catalog',
      maxTurns: 3,
    });

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('max-turns');
    expect(result.drafts).toEqual([]);
    expect(egress.fake.requests).toHaveLength(3);
  });

  it('RF-145 planted instructions stay data: no status changes, the bad read is refused and logged', async () => {
    const { result, egress, logger } = await runRecordedAgent({
      fixture: 'injection',
      recording: 'reader-injection.json',
      area: 'src',
    });

    expect(result.state).toBe('Done');
    const cards = assignCardIds([
      { agentTaskId: 'reader-src', area: 'src', drafts: result.drafts },
    ]);
    expect(
      cards.ok && cards.value.flatMap((card) => card.claims.map((claim) => claim.status)),
    ).toEqual(['Proposed']);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
    for (const sent of egress.fake.requests) {
      expect(sent.system).not.toContain('AI agents');
      expect(holdsDataMarker(sent.system)).toBe(false);
    }
    const read = egress.fake.requests[1]?.messages.find((message) => message.role === 'tool');
    const scan = read === undefined ? undefined : scanDataBlocks(read.content);
    expect(scan?.ok && scan.value.blocks).toBe(1);
    expect(read?.content).toContain('<<<END ROSETTA|-DATA>>>');
    const lines = await egress.egressLines();
    expect(JSON.stringify(lines)).not.toContain('.env');
  });
});
