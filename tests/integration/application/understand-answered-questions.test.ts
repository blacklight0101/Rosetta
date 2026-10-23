import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-243 (P5-02, EV-09): through UnderstandSession with the fake provider, an open question whose
// cited lines define its name never reaches answers.md, and the task log says why; a genuine
// question of the same answer is kept.

const temp = useTempRoot('rosetta-answered-questions-');

async function repository(): Promise<string> {
  const root = join(temp.path, 'repository');
  await mkdir(join(root, 'Assets'), { recursive: true });
  await writeFile(
    join(root, 'Assets', 'Asset.cs'),
    '// Qty: quantity of the asset on hand\nclass Asset\n{\n}\n',
    'utf8',
  );
  return root;
}

describe('an area whose reader asks what a labelled field means', UNDERSTAND_TIMEOUT, () => {
  it('RF-243 P5-02 drops the answered question, logs it, and keeps the genuine one', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      repository: await repository(),
      recording: 'understand-answered-questions.json',
    });
    await h.scan();

    const run = await h.understand({ areas: ['Assets'] });

    expect(run.endState).toBe('Completed');
    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers).toContain('Who counts the assets on hand each month?');
    expect(answers).not.toContain('What does "Qty" represent?');
    const warning = h.logger.entries.find((entry) => entry.message.includes('the code answers'));
    expect(warning).toMatchObject({ level: 'warn' });
    expect(warning?.message).toContain('What does "Qty" represent?');
    expect(warning?.message).toContain('Assets/Asset.cs:1-3');
  });
});
