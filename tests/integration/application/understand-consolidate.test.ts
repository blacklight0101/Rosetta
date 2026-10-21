import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import type { LlmResponse } from '../../../src/application/ports/llm-provider.js';
import {
  BR_CALL,
  cardFiles,
  cardText,
  ENT_CALL,
  made,
  READER_CALLS,
  recording,
  useSharedRun,
} from '../../support/consolidate-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-250, ADR-005: after the readers of all areas have ended, the summariser merges the cards of
// several areas that describe the same entity or rule into one card that keeps every claim and
// citation, and the merge is recorded. The recording understand-consolidate.json has two ENT
// cards and two BR cards of different areas; the summariser answers one merge for each type.

describe('an understand run: the cards it merges', () => {
  const full = useSharedRun();

  it('RF-250 the same entity from two areas is one card with every citation', async () => {
    const { folder } = full.current();

    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md']);
    const text = await cardText(folder, 'ENT', 'ENT-001');
    for (const cited of ['Database/schema.sql', 'Services/CatalogService.cs']) {
      expect(text).toContain(cited);
    }
    expect(text.match(/^### ENT-001\.c\d \(/gmu)).toHaveLength(3);
    expect(text).toContain('A catalog item with an id, a name, a price and a stock.');
  });

  it('RF-250 the merge is recorded in the card and in the log', async () => {
    const { h, folder } = full.current();

    const text = await cardText(folder, 'ENT', 'ENT-001');
    expect(text).toMatch(/mergedFrom:\n\s+- "ENT-001"\n\s+- "ENT-002"/u);
    expect(text).toMatch(/mergedAreas:\n\s+- "Database"\n\s+- "Services"/u);
    const merged = h.logger.entries.filter((entry) => entry.message.includes('merged'));
    expect(merged.map((entry) => entry.message)).toEqual([
      expect.stringContaining('BR-001, BR-002'),
      expect.stringContaining('ENT-001, ENT-002'),
    ]);
  });
});

describe('an understand run: the rules it merges', () => {
  const full = useSharedRun();

  it('RF-250 two rules about one item stay two claims of one card, none judged', async () => {
    const { folder } = full.current();

    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md']);
    const text = await cardText(folder, 'BR', 'BR-001');
    expect(text).toContain('The name label is set to the text Item when the page loads.');
    expect(text).toContain('Get returns the text item followed by the id.');
  });

  it('RF-250 the index lists the merged cards once', async () => {
    const { folder } = full.current();

    const index = await readJson(join(folder, 'cards', 'index.json'));
    expect(index).toMatchObject({ cards: [{ id: 'BR-001' }, { id: 'ENT-001' }] });
  });
});

describe('an understand run: what the summariser is given and what is recorded', () => {
  const full = useSharedRun();

  it('RF-250 the summariser sees only cards, with no tools, one call per type', () => {
    const { h } = full.current();

    const asks = h.providers.requests().slice(READER_CALLS);
    expect(asks.map((ask) => [ask.context.role, ask.tools.length])).toEqual([
      ['summariser', 0],
      ['summariser', 0],
    ]);
    expect(asks[0]?.system).toContain('merge');
    expect(asks[1]?.messages[0]?.content).toContain('Stock item');
    expect(JSON.stringify(asks)).not.toContain('SELECT Id, Name, Price');
  });

  it('RNF-004 the manifest records the merge prompt and the summariser model version', async () => {
    const { h, run } = full.current();

    const manifest = await h.manifestOf(run);
    expect(Object.keys(manifest.promptVersions)).toContain('summariser/merge.v2.md');
    expect(manifest.roles['summariser']?.modelVersion).toBe('fake-model-2026-10-01');
  });

  it('RF-426 the cost report counts the summariser calls', async () => {
    const { folder } = full.current();

    expect(await readJson(join(folder, 'cost.json'))).toMatchObject({
      byRole: [
        { role: 'reader', calls: READER_CALLS },
        { role: 'summariser', calls: 2 },
      ],
    });
  });
});

describe('an understand run: a summariser that gives nothing usable', UNDERSTAND_TIMEOUT, () => {
  const temp = useTempRoot('rosetta-consolidate-');

  it('RF-250 an answer that is not a list of merges leaves those cards, the run goes on', async () => {
    const decorateAnswer = (call: number, response: LlmResponse) =>
      call === BR_CALL ? { ...response, text: 'They look alike to me.' } : response;

    const { h, run, folder } = await made(temp.path, { decorateAnswer });

    expect(run.endState).toBe('Completed');
    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md', 'BR-002.md']);
    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md']);
    expect(h.logger.entries.some((e) => e.level === 'warn' && e.message.includes('BR'))).toBe(true);
  });

  it('RF-250 a summariser call that fails leaves those cards, the run goes on', async () => {
    const beforeCall = (call: number) =>
      call === BR_CALL
        ? Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, 'Down.'))
        : Promise.resolve();

    const { h, run, folder } = await made(temp.path, { beforeCall });

    expect(run.endState).toBe('Completed');
    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md', 'BR-002.md']);
    const warned = h.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.code)).toContain(ERROR_CODES.providerCallFailed);
  });
});

describe('an understand run: a summariser that names the wrong cards', UNDERSTAND_TIMEOUT, () => {
  const temp = useTempRoot('rosetta-consolidate-');

  it('RF-250 a merge that names cards of two types is skipped, the others apply', async () => {
    const wrong = JSON.stringify({
      merges: [{ ids: ['ENT-001', 'BR-001'], title: 'Mixed', summary: 'Mixed.' }],
    });
    const decorateAnswer = (call: number, response: LlmResponse) =>
      call === ENT_CALL ? { ...response, text: wrong } : response;

    const { folder } = await made(temp.path, { decorateAnswer });

    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md', 'ENT-002.md']);
    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md']);
  });

  it('RF-250 a merge that names cards the summariser was not shown is skipped', async () => {
    const forBr = JSON.stringify({
      merges: [{ ids: ['BR-001', 'BR-002'], title: 'Unseen', summary: 'Unseen.' }],
    });
    const decorateAnswer = (call: number, response: LlmResponse) => {
      if (call === BR_CALL) return { ...response, text: '{"merges": []}' };
      return call === ENT_CALL ? { ...response, text: forBr } : response;
    };

    const { folder } = await made(temp.path, { decorateAnswer });

    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md', 'BR-002.md']);
    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md', 'ENT-002.md']);
  });
});

describe('an understand run: when the summariser is not asked', UNDERSTAND_TIMEOUT, () => {
  const temp = useTempRoot('rosetta-consolidate-');

  it('RF-250 a second run over the same recording gives the same ids and files', async () => {
    const h = await createUnderstandHarness({ dataDir: temp.path, recording, replays: 2 });
    await h.scan();

    const first = h.runFolder(await h.understand());
    const second = h.runFolder(await h.understand());

    expect(await cardFiles(second, 'ENT')).toEqual(['ENT-001.md']);
    expect(await cardFiles(second, 'ENT')).toEqual(await cardFiles(first, 'ENT'));
    expect(await cardText(second, 'ENT', 'ENT-001')).toBe(await cardText(first, 'ENT', 'ENT-001'));
    expect(await readJson(join(second, 'cards', 'index.json'))).toEqual(
      await readJson(join(first, 'cards', 'index.json')),
    );
  });

  it('RF-250 a run of one area asks the summariser nothing', async () => {
    const { h } = await made(temp.path, {}, ['(root)']);

    expect(h.providers.requests().map((request) => request.context.role)).toEqual([
      'reader',
      'reader',
    ]);
  });

  it('RF-250 a stopped run asks the summariser nothing', async () => {
    const { h, run } = await made(temp.path, {
      beforeCall: async (call, harness) => {
        if (call === READER_CALLS) await harness.stopRunning();
      },
    });

    expect(run.endState).toBe('Interrupted');
    const roles = h.providers.requests().map((request) => request.context.role);
    expect(roles).not.toContain('summariser');
  });
});
