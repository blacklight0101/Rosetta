import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RNF-004, RF-205: a run whose reader uses Ollama with the text tool protocol records the protocol
// prompt file with its version and the SHA-256 of its bytes, next to the reader's prompt files.

const temp = useTempRoot('rosetta-understand-protocol-');
const protocolName = 'shared/text-tool-protocol.v1.md';

function ollamaReader(toolMode: 'native' | 'text'): ProjectSettings {
  return understandSettings((settings) => ({
    ...settings,
    providers: {
      ...settings.providers,
      ollama: { kind: 'ollama', keySource: 'user', toolMode, timeoutSeconds: 10, maxRetries: 0 },
    },
    roles: { ...settings.roles, reader: { ...settings.roles.reader, provider: 'ollama' } },
  }));
}

async function promptVersionsOf(settings: ProjectSettings): Promise<Record<string, unknown>> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-csharp-full.json',
    settings,
  });
  await h.scan();
  const run = await h.understand();
  return (await h.manifestOf(run)).promptVersions;
}

describe('an understand run: the text tool protocol', UNDERSTAND_TIMEOUT, () => {
  it('RNF-004 records the protocol file hash when the reader uses the text tool protocol', async () => {
    const bytes = await readFile(join('prompts', protocolName));
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    const versions = await promptVersionsOf(ollamaReader('text'));

    expect(versions[protocolName]).toEqual({ version: 'v1', sha256 });
    expect(versions['reader/area.v2.md']).toBeDefined();
  });

  it('RNF-004 leaves the protocol out when the reader calls tools natively', async () => {
    const versions = await promptVersionsOf(ollamaReader('native'));

    expect(Object.keys(versions)).not.toContain(protocolName);
    expect(versions['reader/area.v2.md']).toBeDefined();
  });
});
