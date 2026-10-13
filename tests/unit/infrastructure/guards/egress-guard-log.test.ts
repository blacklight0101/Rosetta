import { describe, expect, it } from 'vitest';
import { OTHER_TAG } from '../../../support/data-block-tags.js';
import { renderDataBlock } from '../../../../src/domain/egress/data-block.js';
import {
  egressHarness,
  egressInstant,
  readConversation,
  requestWith,
  toolResult,
} from '../../../support/egress-harness.js';
import { secretCases } from '../../../support/secret-fixture.js';

// RF-142, data-model.md section 3.11: one egress line per call with where it went and the path and
// line range of every excerpt, never the excerpt text.

const noMasks = {
  'api-key': 0,
  'bearer-token': 0,
  'connection-string': 0,
  password: 0,
  'private-key': 0,
};

describe('EgressGuard egress log', () => {
  it('RF-142 records provider, model, role, agent task and every excerpt of a call', async () => {
    const { guard, egressLines } = await egressHarness();

    await guard.complete(requestWith(readConversation(toolResult({ text: 'a\nb\nc' }))));

    expect(await egressLines()).toEqual([
      {
        schemaVersion: 1,
        seq: 1,
        at: egressInstant,
        callId: '20261011-090503-understand#1',
        provider: 'main',
        model: 'contract-model',
        role: 'reader',
        agentTaskId: 'task-1',
        excerpts: [{ path: 'src/Web.config', startLine: 1, endLine: 3 }],
        maskedCounts: noMasks,
      },
    ]);
  });
});

describe('EgressGuard egress log excerpts', () => {
  it('RF-142 lists the excerpts of every block in message order', async () => {
    const { guard, egressLines } = await egressHarness();
    const codeMap = renderDataBlock(
      {
        source: 'list_area_files',
        excerpts: [{ path: 'src/Catalog.cs', startLine: 1, endLine: 80 }],
        text: 'src/Catalog.cs',
      },
      OTHER_TAG,
    );
    const grep = toolResult({
      source: 'grep',
      excerpts: [
        { path: 'src/A.cs', startLine: 4, endLine: 4 },
        { path: 'src/B.cs', startLine: 9, endLine: 9 },
      ],
      text: 'src/A.cs:4: x\nsrc/B.cs:9: y',
    });

    await guard.complete(
      requestWith([
        { role: 'user', content: `Area files:\n${codeMap}` },
        ...readConversation(grep).slice(1),
      ]),
    );

    const [line] = await egressLines();
    expect(line).toMatchObject({
      excerpts: [
        { path: 'src/Catalog.cs', startLine: 1, endLine: 80 },
        { path: 'src/A.cs', startLine: 4, endLine: 4 },
        { path: 'src/B.cs', startLine: 9, endLine: 9 },
      ],
    });
  });
});

describe('EgressGuard egress log content and order', () => {
  it('RF-142 never copies excerpt text or a secret into the egress log', async () => {
    const { guard, egressLines } = await egressHarness();
    const text = ['UniqueExcerptMarker42', ...secretCases.map((secret) => secret.text)].join('\n');

    await guard.complete(requestWith(readConversation(toolResult({ text }))));

    const log = JSON.stringify(await egressLines());
    expect(log).not.toContain('UniqueExcerptMarker42');
    for (const value of secretCases.flatMap((secret) => secret.secrets)) {
      expect(log).not.toContain(value);
    }
    expect(log).toContain('"maskedCounts"');
  });

  it('RF-142 numbers the lines of a run from 1 without gaps', async () => {
    const { guard, egressLines } = await egressHarness();
    const request = requestWith(readConversation(toolResult({ text: 'x' })));

    await guard.complete(request);
    await guard.complete({ ...request, context: { ...request.context, callId: 'run#2' } });

    const lines = await egressLines();
    expect(lines).toMatchObject([
      { seq: 1, callId: '20261011-090503-understand#1' },
      { seq: 2, callId: 'run#2' },
    ]);
  });
});
