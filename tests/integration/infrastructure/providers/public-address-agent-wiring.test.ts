import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesConstructing } from '../../../support/agent-usage.js';

// RF-1104, DEC-112, threat model TB5 (P1-49 F-13): the connect-time public-address check against
// DNS rebinding lives in PublicAddressAgent, and nothing in src/ constructs it yet, because no adapter
// connects to a stored base URL in Phase 1. The adapter that does (the OpenAI-compatible one, card
// P2-10; the card text of P1-161 names P2-09) must build its HTTPS agent with it.
//
// `it.fails` marks the test as expected to fail: it passes while no adapter uses the agent, and
// FAILS the day one does, which tells whoever wires the agent to delete `.fails` here and make
// the test a plain one. Wiring the agent is not part of the card P1-161.

describe('PublicAddressAgent in the provider adapters', () => {
  it.fails(
    'RF-1104 P2-09 P2-10: an adapter that connects to a stored base URL builds a PublicAddressAgent (expected to fail until that adapter is wired)',
    async () => {
      const users = await filesConstructing(
        process.cwd(),
        'src/infrastructure/providers',
        'PublicAddressAgent',
      );

      expect(users).not.toEqual([]);
    },
  );
});

describe('the wiring scan', () => {
  let base = '';

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'rosetta-wiring-'));
    await mkdir(join(base, 'providers', 'openai-compatible'), { recursive: true });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('RF-1104 finds the adapter file that builds the agent, in a sub-folder, and no other', async () => {
    const adapter =
      "import { PublicAddressAgent } from '../x.js';\nconst a = new PublicAddressAgent();";
    await writeFile(join(base, 'providers', 'openai-compatible', 'adapter.ts'), adapter, 'utf8');
    await writeFile(
      join(base, 'providers', 'other.ts'),
      "import { PublicAddressAgent } from './x.js';\nexport type T = PublicAddressAgent;",
      'utf8',
    );

    expect(await filesConstructing(base, 'providers', 'PublicAddressAgent')).toEqual([
      'providers/openai-compatible/adapter.ts',
    ]);
  });

  it('RF-1104 finds nothing in a folder of adapters that do not build the agent', async () => {
    await writeFile(join(base, 'providers', 'a.ts'), 'export const a = 1;', 'utf8');

    expect(await filesConstructing(base, 'providers', 'PublicAddressAgent')).toEqual([]);
  });
});
