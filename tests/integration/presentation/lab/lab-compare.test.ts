import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labParts, verdict } from '../../../support/lab-harness.js';
import {
  overviewArgs,
  runLab,
  verifierArgs,
  writtenResults,
} from '../../../support/lab-run-helpers.js';
import { runLabCompare } from '../../../../src/presentation/lab/lab-command.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1403: `npm run lab -- --compare a b` reads two results and makes no call.

const temp = useTempRoot('rosetta-lab-compare-');
const out = (): string => join(temp.path, 'lab-out');

async function twoVersions() {
  const draft = join(temp.path, 'draft.md');
  await writeFile(draft, 'You are the draft verifier.\n');
  const router = new ModelRouter({
    'model-a': [
      ...[verdict('Supported'), 'Maybe.', verdict('Rejected'), verdict('Rejected')],
      ...['Maybe.', 'Perhaps.'],
      ...[verdict('Supported'), verdict('Rejected'), verdict('Supported'), verdict('Rejected')],
      ...['{"application":[]}', '{"application":[]}'],
    ],
  });
  const parts = labParts({ outputDir: out(), router });
  await runLab(parts, verifierArgs);
  await runLab(parts, { ...verifierArgs, version: draft });
  const [first, second] = await writtenResults(out());
  if (first === undefined || second === undefined) throw new Error('no results');
  return { parts, router, first, second };
}

describe('the lab comparison report', () => {
  it('RF-1403 shows the two versions side by side on the same cases and sends nothing', async () => {
    const { router, first, second } = await twoVersions();
    const sent = router.requests.length;
    const lines: string[] = [];

    const code = await runLabCompare(out(), first.id, second.id, (line) => {
      lines.push(line);
    });

    const text = lines.join('\n');
    expect(code).toBe(0);
    expect(router.requests).toHaveLength(sent);
    expect(text).toContain('verifier/claim.v5.md');
    expect(text).toContain('draft.md');
    for (const id of ['vc-01', 'vc-02', 'vc-03', 'vc-04']) expect(text).toContain(id);
    expect(text).toContain('first try');
  });

  it('RF-1403 refuses two runs of different case sets and an id that has no results', async () => {
    const { parts, first } = await twoVersions();
    await runLab(parts, overviewArgs);
    const [, , third] = await writtenResults(out());
    const lines: string[] = [];
    const print = (line: string): void => {
      lines.push(line);
    };

    const different = await runLabCompare(out(), first.id, third?.id ?? '', print);
    const missing = await runLabCompare(out(), first.id, 'no-such-run', print);

    expect([different, missing]).toEqual([1, 1]);
    expect(lines.join('\n')).toContain('case set');
  });
});
