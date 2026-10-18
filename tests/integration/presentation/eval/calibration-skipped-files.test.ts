import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CalibrationSet } from '../../../../src/application/eval/calibration-set-schema.js';
import { runCalibration } from '../../../../src/presentation/eval/compose-calibration.js';
import { ModelRouter, answersFor, calibrationParts } from '../../../support/calibration-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-100, RF-305, P2-39: a file the scan would skip (a binary file, or one above the size limit) is
// never read or sent to the verifier, in a calibration as in a run: the model gets a
// note without the path (P2-44), and the bytes of the file never reach the provider.

const temp = useTempRoot('rosetta-calibration-skip-');
const judge = { provider: 'fake', model: 'judge-a' };

const set: CalibrationSet = {
  schemaVersion: 1,
  version: 'skip.test',
  description: 'One text file and one binary file.',
  source: { folder: 'src' },
  claims: [
    {
      id: 'cal-text',
      text: 'The page sets the title.',
      citations: [{ path: 'Page.cs', startLine: 1, endLine: 2 }],
      supported: true,
      note: 'Line 1.',
    },
    {
      id: 'cal-binary',
      text: 'The blob defines a table.',
      citations: [{ path: 'blob.bin', startLine: 1, endLine: 2 }],
      supported: false,
      note: 'A binary file shows nothing.',
    },
  ],
};

async function calibrate(files: Readonly<Record<string, Uint8Array | string>>) {
  const root = join(temp.path, 'repo');
  await mkdir(join(root, 'src'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, 'src', name), content);
  }
  const router = new ModelRouter({ 'judge-a': answersFor(set) });
  const parts = calibrationParts({
    outputDir: join(temp.path, 'out'),
    router,
    repositoryRoot: root,
  });
  const result = await runCalibration(parts, { set, sha256: 'a'.repeat(64) }, [judge]);
  return { router, result };
}

const binary = Uint8Array.from([
  0x4d, 0x5a, 0x00, 0x01, 0x02, 0x00, 0x53, 0x45, 0x43, 0x52, 0x45, 0x54,
]);

describe('the calibration and the files the scan would skip', () => {
  it('RF-100 sends a cited binary file as a note only, never its path or bytes', async () => {
    const { router, result } = await calibrate({
      'Page.cs': 'Title = "x";\nDone();\n',
      'blob.bin': binary,
    });
    const message = router.requests[1]?.messages[0]?.content ?? '';

    expect(result.ok).toBe(true);
    expect(message).not.toContain('blob.bin');
    expect(message).toContain('binary, not sent');
    expect(message).not.toContain('SECRET');
    expect(message).not.toContain('\u0000');
  });

  it('RF-100 still sends the lines of a text file next to it', async () => {
    const { router } = await calibrate({
      'Page.cs': 'Title = "x";\nDone();\n',
      'blob.bin': binary,
    });

    expect(router.requests[0]?.messages[0]?.content).toContain('Title = "x";');
  });

  it('RF-100 treats a file above the size limit as skipped too', async () => {
    const big = `${'x'.repeat(1_100_000)}\n`;
    const { router } = await calibrate({ 'Page.cs': 'Title = "x";\n', 'blob.bin': big });
    const message = router.requests[1]?.messages[0]?.content ?? '';

    expect(message).toContain('too-large, not sent');
    expect(message).not.toContain('xxxxxxxxxx');
  });
});
