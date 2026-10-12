import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { loadTextToolProtocol } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useTempRoot } from '../../../../support/temp-root.js';

// RNF-004, RF-205: the text tool protocol is a versioned prompt file; the loader returns its
// version and the SHA-256 of its bytes for the run manifest, with the text the model reads.

const protocolPath = join('prompts', 'shared', 'text-tool-protocol.v1.md');

describe('loadTextToolProtocol', () => {
  const temp = useTempRoot('rosetta-text-protocol-');

  it('RNF-004 returns the version, the SHA-256 of the bytes and the text', async () => {
    const bytes = await readFile(protocolPath);

    const protocol = await loadTextToolProtocol('prompts');

    expect(protocol).toMatchObject({
      version: 'v1',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      text: bytes.toString('utf8'),
    });
  });

  it('RNF-004 refuses a protocol prompt that lost its tools placeholder', async () => {
    await mkdir(join(temp.path, 'shared'));
    await writeFile(join(temp.path, 'shared', 'text-tool-protocol.v1.md'), 'Call tools.');

    const failure = await failureOf(loadTextToolProtocol(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });
});
