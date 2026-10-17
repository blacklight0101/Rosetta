import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import {
  readJson,
  UNDERSTAND_TIMEOUT,
  useSharedFullRun,
} from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-301, RF-302, RF-1004, ADR-005, ADR-008: the judgement step inside an understand run on the C#
// fixture: the recorded reader, then the recorded verifier, through the real provider factory,
// egress and budget guards, card writers and event log.

const full = useSharedFullRun('rosetta-judgement-');

const indexSchema = z.object({
  cards: z.array(z.object({ id: z.string(), claimCounts: z.record(z.string(), z.number()) })),
});

const egressLine = z.object({
  role: z.string(),
  agentTaskId: z.string(),
  excerpts: z.array(z.object({ path: z.string(), startLine: z.number(), endLine: z.number() })),
});

describe('an understand run: judgement', () => {
  it('RF-301 RF-302 judges every claim that passed the citation check and keeps every claim with its status and reason', async () => {
    const { folder } = full.current();

    const details = await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(details).toMatch(/claimId: "BR-001\.c1"[\s\S]*status: "Supported"/u);
    expect(details).toMatch(/claimId: "BR-001\.c2"[\s\S]*status: "CitationInvalid"/u);
    expect(details).toContain('Line 7 sets NameLabel.Text');
    const stock = await readFile(join(folder, 'cards', 'BR', 'BR-002.md'), 'utf8');
    expect(stock).toContain('status: "Rejected"');
    expect(stock).toContain('step: "judgement"');
    expect(stock).toContain('nothing in the lines runs it.');
    const index = indexSchema.parse(await readJson(join(folder, 'cards', 'index.json')));
    const counts = Object.fromEntries(index.cards.map((card) => [card.id, card.claimCounts]));
    expect(counts).toEqual({
      'BR-001': { Proposed: 0, CitationInvalid: 2, Supported: 1, Rejected: 0, Unverified: 0 },
      'BR-002': { Proposed: 0, CitationInvalid: 0, Supported: 0, Rejected: 1, Unverified: 0 },
      'ENT-001': { Proposed: 0, CitationInvalid: 0, Supported: 1, Rejected: 0, Unverified: 0 },
      'FEAT-001': { Proposed: 0, CitationInvalid: 0, Supported: 1, Rejected: 0, Unverified: 0 },
      'OQ-001': { Proposed: 0, CitationInvalid: 0, Supported: 1, Rejected: 0, Unverified: 0 },
    });
  });

  it('RF-1004 publishes one verify.claim.judged per judged claim, after the citation checks', async () => {
    const { h, run } = full.current();

    const events = await h.eventsOf(run);
    const judged = events.filter((event) => event.type === 'verify.claim.judged');
    expect(judged.map((event) => [event.data['claimId'], event.data['status']])).toEqual([
      ['FEAT-001.c1', 'Supported'],
      ['OQ-001.c1', 'Supported'],
      ['BR-001.c1', 'Supported'],
      ['ENT-001.c1', 'Supported'],
      ['BR-002.c1', 'Rejected'],
    ]);
    expect(judged.every((event) => typeof event.data['reason'] === 'string')).toBe(true);
    const lastCheck = events.findLastIndex((event) => event.type === 'verify.citation.checked');
    const firstVerdict = events.findIndex((event) => event.type === 'verify.claim.judged');
    expect(firstVerdict).toBeGreaterThan(lastCheck);
    expect(events.at(-1)?.type).toBe('run.ended');
    expect(run.endState).toBe('Completed');
    const family = h.logger.entries.filter((entry) => entry.message.includes('self-preference'));
    expect(family).toEqual([]);
  });
});

describe('an understand run: judgement and egress', () => {
  it('RF-301 ADR-006 each verifier call leaves through the egress guard with only its cited lines', async () => {
    const { h, folder } = full.current();

    const lines = (await readFile(join(folder, 'egress.log.jsonl'), 'utf8'))
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => egressLine.parse(JSON.parse(line)))
      .filter((line) => line.role === 'verifier');
    expect(lines.map((line) => [line.agentTaskId, line.excerpts])).toEqual([
      ['verifier-FEAT-001.c1', [{ path: 'Default.aspx.cs', startLine: 5, endLine: 14 }]],
      ['verifier-OQ-001.c1', [{ path: 'Default.aspx.cs', startLine: 7, endLine: 13 }]],
      ['verifier-BR-001.c1', [{ path: 'Catalog/Details.aspx.cs', startLine: 2, endLine: 10 }]],
      ['verifier-ENT-001.c1', [{ path: 'Database/schema.sql', startLine: 1, endLine: 9 }]],
      ['verifier-BR-002.c1', [{ path: 'Services/CatalogService.cs', startLine: 9, endLine: 15 }]],
    ]);
    expect(h.providers.verifierRequests().map((request) => request.tools)).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
  });
});

describe('an understand run: model families', () => {
  const temp = useTempRoot('rosetta-family-');

  it(
    'RF-301 a verifier of the reader model family logs the self-preference warning and the run continues',
    async () => {
      const settings = understandSettings((s) => ({
        ...s,
        roles: { ...s.roles, verifier: { ...s.roles.verifier, model: 'fake-judge' } },
      }));
      const h = await createUnderstandHarness({
        ...{ dataDir: temp.path, settings, recording: 'understand-csharp-full.json' },
        verifierRecording: 'verifier-csharp-full.json',
      });
      await h.scan();

      const run = await h.understand();

      const warning = h.logger.entries.find((entry) => entry.message.includes('self-preference'));
      expect(warning).toMatchObject({ level: 'warn', logger: 'understand', runId: run.runKey });
      expect(run.endState).toBe('Completed');
      expect(h.providers.verifierRequests()).toHaveLength(5);
    },
    UNDERSTAND_TIMEOUT.timeout,
  );
});
