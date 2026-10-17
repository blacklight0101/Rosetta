import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReadOnlyTools } from '../../../src/application/agent/read-only-tools.js';
import {
  judgementPartsOf,
  runJudgementStep,
} from '../../../src/application/understand/claim-judgement.js';
import { ManifestUpdates } from '../../../src/application/runs/manifest-updates.js';
import { createCard } from '../../../src/domain/cards/card.js';
import { scopeFor } from '../../support/run-event-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { CodeMapIndex } from '../../../src/application/agent/code-map-index.js';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { scanDataBlocks } from '../../../src/domain/egress/data-block-scan.js';
import { scanToOutputs } from '../../support/code-map-harness.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { SequenceIdGenerator } from '../../support/sequence-id-generator.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { scanTree } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-100, RF-145, P2-39: a crafted repository with a binary file the claim cites. The scan lists
// it as skipped; the verifier's request names its path and says "binary, not sent", and no byte
// of it is in any message, even when the citation spells the path in another case.

const span = '0123456789abf001';
const PAYLOAD = 'TOPSECRET-PAYLOAD-7';

const answer = {
  retried: [],
  response: {
    text: 'Reason: Nothing to read.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const temp = useTempRoot('rosetta-binary-cite-');

async function craftedRepository() {
  const root = join(temp.path, 'repo');
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'assets', 'blob.dat'),
    Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(`\n${PAYLOAD}\nline3\n`)]),
  );
  await writeFile(join(root, 'src', 'A.cs'), 'class A\n{\n    int x = 1;\n}\n');
  const out = await scanToOutputs(root, {
    runFolder: 'runs/one',
    dataDir: join(temp.path, 'data'),
    withCSharpPack: false,
  });
  const { reader } = await scanTree(root);
  return { codeMap: out.codeMap, reader };
}

function sentText(requests: readonly { readonly messages: readonly { content: string }[] }[]) {
  return requests.flatMap((request) => request.messages.map((message) => message.content));
}

describe('a claim that cites a binary file of a crafted repository', () => {
  it('RF-100 the scan lists the file as skipped, which is what the judgement relies on', async () => {
    const { codeMap } = await craftedRepository();

    expect(codeMap.files.find((file) => file.path === 'assets/blob.dat')?.skipped).toBe('binary');
  });

  it.each(['assets/blob.dat', 'Assets/BLOB.DAT'])(
    'RF-100 the verifier is sent the path of %s and a note, never its bytes',
    async (cited) => {
      const { codeMap, reader } = await craftedRepository();
      const index = new CodeMapIndex(codeMap);
      const h = await verifierHarness({
        recording: recordingOf(answer),
        skipReason: (path) => index.skipReasonOf(path),
      });
      const claim = {
        claimId: 'BR-001.c1',
        text: 'The blob holds a secret.',
        citations: [
          { path: cited, startLine: 1, endLine: 3 },
          { path: 'src/A.cs', startLine: 1, endLine: 2 },
        ],
      };

      const judgement = await judgeClaim({ ...h.parts, reader }, claim, span);

      expect(judgement).toMatchObject({ kind: 'judged' });
      const sent = sentText(h.requests());
      expect(sent).toHaveLength(1);
      expect(sent.join('\n')).not.toContain(PAYLOAD);
      const scan = scanDataBlocks(sent[0] ?? '');
      expect(scan.ok && scan.value.excerpts.map((excerpt) => excerpt.path)).toEqual([
        cited,
        'src/A.cs',
      ]);
      const texts = scan.ok ? scan.value.parts.filter((part) => !part.frame) : [];
      expect(texts.some((part) => part.text === 'binary, not sent')).toBe(true);
    },
  );
});

describe('the reader role and a binary file of a crafted repository', () => {
  it.each(['assets/blob.dat', 'ASSETS/Blob.dat'])(
    'RF-100 read_file refuses %s and sends nothing of it',
    async (path) => {
      const { codeMap, reader } = await craftedRepository();
      const area = codeMap.areas.find((each) => each.files.includes('assets/blob.dat'));
      if (area === undefined) throw new Error('the crafted repository has no area for the blob');
      const logger = new MemoryLogger(
        new FixedClock('2026-10-12T09:00:00.000Z'),
        new SecretMasker(),
      );
      const tools = new ReadOnlyTools({
        reader,
        codeMap,
        area,
        logger,
        ids: new SequenceIdGenerator(),
      });
      const call = { id: 'c1', name: 'read_file', arguments: { path, startLine: 1, endLine: 3 } };

      const outcome = await tools.run(call, { runId: 'r', agentTaskId: 't', callId: 'r#1' });

      expect(outcome.error?.code).toBe(ERROR_CODES.toolFileSkipped);
      expect(outcome.content).not.toContain(PAYLOAD);
    },
  );
});

describe('the judgement step of a run over a crafted repository', () => {
  it.each(['assets/blob.dat', 'Assets/BLOB.DAT'])(
    'RF-100 the wiring of the step keeps the bytes of %s out of the verifier request',
    async (cited) => {
      const { codeMap, reader } = await craftedRepository();
      const h = await verifierHarness({ recording: recordingOf(answer) });
      const card = createCard({
        ...{ id: 'BR-001', type: 'BR', title: 'Blob', summary: 'The blob.' },
        ...{ area: 'assets', agentTaskId: 'reader-001', confidence: 'Medium' },
        claims: [
          {
            text: 'The blob holds a secret.',
            citations: [{ path: cited, startLine: 1, endLine: 3 }],
          },
        ],
      });
      if (!card.ok) throw new Error('The fixture card is invalid.');
      const scope = scopeFor('20261012-100000-understand');
      const context = {
        execution: {
          run: { runKey: scope.runKey },
          events: h.step().events,
          signal: new AbortController().signal,
        },
        scanned: { reader, codeMap },
        settings: settingsFor({}),
        updates: new ManifestUpdates(
          { read: () => Promise.resolve(undefined), write: () => Promise.resolve() },
          scope,
        ),
        nextCallId: () => 'run#1',
        traceId: '0123456789abcdef0123456789abcdef',
        ids: new SequenceIdGenerator(),
        verifier: { role: h.parts.role, prompts: h.prompts },
      };
      const parts = judgementPartsOf(context, new FixedClock('2026-10-12T10:00:00.000Z'));

      await runJudgementStep([card.value], parts);

      const sent = sentText(h.requests()).join('\n');
      expect(sent).toContain('binary, not sent');
      expect(sent).not.toContain(PAYLOAD);
    },
  );
});
