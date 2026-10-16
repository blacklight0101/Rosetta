import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesConstructing } from '../../../support/agent-usage.js';

// RF-1104, DEC-112, threat model TB5 (P1-49 F-13): the connect-time public-address check against
// DNS rebinding lives in PublicAddressAgent. The adapter that connects to a stored base URL (the
// OpenAI-compatible one, card P2-10) gets its transport built on that agent by the adapter builder;
// this scan fails the day no file under the providers folder builds the agent any more.

describe('PublicAddressAgent in the provider adapters', () => {
  it('RF-1104 the adapter folder the wiring test scans exists and holds adapters', async () => {
    const folder = join(process.cwd(), 'src/infrastructure/providers');

    expect((await stat(folder)).isDirectory()).toBe(true);
    expect(
      await filesConstructing(process.cwd(), 'src/infrastructure/providers', 'OpenAiProvider'),
    ).not.toEqual([]);
  });

  it('RF-1104 P2-10: the adapter that connects to a stored base URL is built on a PublicAddressAgent', async () => {
    const users = await filesConstructing(
      process.cwd(),
      'src/infrastructure/providers',
      'PublicAddressAgent',
    );

    expect(users).toEqual(['src/infrastructure/providers/adapter-builder.ts']);
  });
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
