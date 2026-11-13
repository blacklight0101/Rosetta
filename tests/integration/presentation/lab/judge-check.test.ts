import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CheckItem } from '../../../../src/application/lab/judge/judge-check-set.js';
import type { Rubric } from '../../../../src/application/lab/judge/rubric.js';
import { loadCheckItems } from '../../../../src/infrastructure/lab/judge-check-files.js';
import type { LabArgs } from '../../../../src/presentation/lab/lab-args.js';
import { runJudgeCheck } from '../../../../src/presentation/lab/judge-check-command.js';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { judgeReply } from '../../../support/judge-harness.js';
import { labParts } from '../../../support/lab-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1405, RF-1402: `npm run lab -- --judge-check` over the fake provider. The judge is model-b.

const temp = useTempRoot('rosetta-judge-check-');
const out = (): string => join(temp.path, 'lab-out');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const folders = {
  labFolder: `${root}lab/`,
  promptsFolder: `${root}prompts/`,
  evalFolder: `${root}eval/`,
  repositoryRoot: root,
};
type CheckArgs = Extract<LabArgs, { kind: 'judge-check' }>;
const args: CheckArgs = {
  kind: 'judge-check',
  model: { provider: 'fake', model: 'model-b' },
  yes: true,
};

/** The reply of a judge that agrees with every hand label and hand score. */
function perfect(item: CheckItem, rubrics: ReadonlyMap<string, Rubric>): string {
  const ids = (rubrics.get(item.family)?.criteria ?? []).map((each) => each.id);
  if (item.kind === 'calibration') {
    return judgeReply(ids, { 'verdict-correct': item.followsLabel ? 5 : 1 });
  }
  return judgeReply(ids, item.scores ?? {});
}

async function loaded() {
  const result = await loadCheckItems(folders);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('the judge check', () => {
  it('RF-1405 sends nothing without --yes and says how many calls it would make', async () => {
    const router = new ModelRouter({});
    const lines: string[] = [];

    const code = await runJudgeCheck(
      labParts({ outputDir: out(), router }),
      { ...args, yes: false },
      folders,
      (line) => lines.push(line),
    );

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(lines.join('\n')).toMatch(/\d+ judge calls/u);
  });
});

describe('the judge check with a judge that agrees', () => {
  it('RF-1405 scores every item once through the ledger and reports full agreement for a judge that agrees', async () => {
    const { items, rubrics } = await loaded();
    const router = new ModelRouter({ 'model-b': items.map((item) => perfect(item, rubrics)) });
    const lines: string[] = [];

    const code = await runJudgeCheck(
      labParts({ outputDir: out(), router }),
      args,
      folders,
      (line) => lines.push(line),
    );

    const [folder] = await readdir(out(), { withFileTypes: true }).then((list) =>
      list.filter((entry) => entry.isDirectory()),
    );
    const report = JSON.parse(
      await readFile(join(out(), folder?.name ?? '', 'judge-check.json'), 'utf8'),
    ) as {
      calibration: { items: number; agreed: number };
      families: Record<string, { samples: number; overallAgreed: number }>;
    };
    const ledger = await readFile(join(out(), 'ledger.jsonl'), 'utf8');
    expect(code).toBe(0);
    expect(router.requests).toHaveLength(items.length);
    expect(ledger.split('\n').filter((line) => line.includes('"t":"settle"'))).toHaveLength(
      items.length,
    );
    expect(report.calibration).toMatchObject({ items: 12, agreed: 12 });
    for (const family of Object.values(report.families)) {
      expect(family.overallAgreed).toBe(family.samples);
    }
    expect(lines.join('\n')).toContain('Calibration claims: 12 of 12');
  });
});

describe('the judge check inputs and disagreement', () => {
  it('RF-1405 withholds the hand label from the judge on the calibration claims', async () => {
    const { items, rubrics } = await loaded();
    const router = new ModelRouter({ 'model-b': items.map((item) => perfect(item, rubrics)) });

    await runJudgeCheck(labParts({ outputDir: out(), router }), args, folders, () => undefined);
    const first = router.requests[0]?.messages[0]?.content ?? '';

    expect(first).toContain('no hand label');
  });

  it('RF-1405 reports disagreement when the judge scores a wrong verdict high', async () => {
    const { items, rubrics } = await loaded();
    const replies = items.map((item) =>
      item.kind === 'calibration'
        ? judgeReply(['grounding', 'verdict-correct', 'reason-quality', 'form'], {}, 5)
        : perfect(item, rubrics),
    );
    const router = new ModelRouter({ 'model-b': replies });
    const lines: string[] = [];

    await runJudgeCheck(labParts({ outputDir: out(), router }), args, folders, (line) =>
      lines.push(line),
    );

    expect(lines.join('\n')).toContain('Calibration claims: 6 of 12');
  });
});
