import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileRunManifestStore } from '../../../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  egressHarness,
  egressInstant,
  egressScope,
  readConversation,
  requestWith,
  toolResult,
  type EgressHarnessOptions,
} from '../../../support/egress-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { secretCases } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-141, RF-142, RF-143 with the fake provider and a real data folder: the egress log and the
// manifest land in the run folder, the fake never sees a secret, and a cloud call without consent
// sends and writes nothing.

const data = useTempRoot('rosetta-egress-');

function runDir(): string {
  const { userId, projectId, runKey } = egressScope;
  return join(data.path, 'users', userId, 'projects', projectId, 'runs', runKey);
}

function onDisk(): Pick<EgressHarnessOptions, 'writer' | 'manifests'> {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock(egressInstant), masker);
  const writer = new NodeOutputWriter({ dataDir: data.path, logger });
  return { writer, manifests: new FileRunManifestStore({ writer, masker }) };
}

async function egressFile(): Promise<string> {
  return readFile(join(runDir(), 'egress.log.jsonl'), 'utf8');
}

const secretText = secretCases.map((secret) => secret.text).join('\n');
const allSecrets = secretCases.flatMap((secret) => secret.secrets);

describe('EgressGuard on a data folder', () => {
  it('RF-142 appends one line per call to egress.log.jsonl in the run folder', async () => {
    const { guard } = await egressHarness(onDisk());
    const request = requestWith(readConversation(toolResult({ text: 'a\nb' })));

    await guard.complete(request);
    await guard.complete({ ...request, context: { ...request.context, callId: 'run#2' } });

    const lines = (await egressFile()).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      seq: 1,
      provider: 'main',
      model: 'contract-model',
      role: 'reader',
      agentTaskId: 'task-1',
      excerpts: [{ path: 'src/Web.config', startLine: 1, endLine: 2 }],
    });
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({ seq: 2, callId: 'run#2' });
  });

  it('RF-142 continues seq after a resumed run and drops a torn last line', async () => {
    await mkdir(runDir(), { recursive: true });
    const earlier = JSON.stringify({ schemaVersion: 1, seq: 1, callId: 'earlier#1' });
    await writeFile(join(runDir(), 'egress.log.jsonl'), `${earlier}\n{"schemaVersion":1,"se`);
    const { guard } = await egressHarness(onDisk());

    await guard.complete(requestWith(readConversation(toolResult({ text: 'x' }))));

    const lines = (await egressFile()).split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(earlier);
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({ seq: 2 });
  });
});

describe('EgressGuard on a data folder with secrets', () => {
  it('RF-141 never lets a fixture secret reach the provider, the egress log or the manifest', async () => {
    const { guard, fake } = await egressHarness(onDisk());

    await guard.complete(
      requestWith(readConversation(toolResult({ text: secretText })), secretText),
    );

    const written = [
      JSON.stringify(fake.requests),
      await egressFile(),
      await readFile(join(runDir(), 'manifest.json'), 'utf8'),
    ].join('\n');
    expect(fake.requests).toHaveLength(1);
    for (const value of allSecrets) expect(written).not.toContain(value);
  });

  it('RF-141 records the mask counts in manifest.json', async () => {
    const { guard } = await egressHarness(onDisk());

    await guard.complete(requestWith(readConversation(toolResult({ text: secretText }))));

    const manifest: unknown = JSON.parse(await readFile(join(runDir(), 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ masking: new SecretMasker().mask(secretText).counts });
  });

  it('RF-143 refuses a cloud call without consent: nothing sent and no egress line', async () => {
    const { guard, fake } = await egressHarness({ ...onDisk(), kind: 'openai' });

    const failure = await failureOf(
      guard.complete(requestWith(readConversation(toolResult({ text: 'x' })))),
    );

    expect(failure).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(fake.requests).toEqual([]);
    expect(await readdir(runDir())).toEqual(['manifest.json']);
    const manifest: unknown = JSON.parse(await readFile(join(runDir(), 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ security: { blockedCalls: 1 } });
  });
});
