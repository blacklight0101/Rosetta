import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labParts } from '../../../support/lab-harness.js';
import { runLab, verifierArgs, writtenResults } from '../../../support/lab-run-helpers.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1406, RF-1403: the lab over committed captured sets with the fake provider. No real model.

const temp = useTempRoot('rosetta-lab-captured-');
const out = (): string => join(temp.path, 'lab-out');

const runOf = (prompt: string, version: string, cases: string) => ({
  ...verifierArgs,
  prompt,
  version,
  cases,
});

describe('the lab over captured case sets', () => {
  it('RF-1406 runs the planner gap set and keeps the split of the set in the results', async () => {
    const router = new ModelRouter({ 'model-a': Array.from({ length: 11 }, () => '{"tasks":[]}') });

    const { code } = await runLab(
      labParts({ outputDir: out(), router }),
      runOf('planner/gap', 'v6', 'planner-gap'),
    );
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(results?.cases).toHaveLength(11);
    expect(results?.cases.every((each) => each.detail === 'NoCards' && each.validFirstTry)).toBe(
      true,
    );
    expect(results?.cases.filter((each) => each.split === 'held-back')).toHaveLength(4);
    expect(results?.caseSet.version).toBe('planner-gap-1');
  });

  it('RF-1406 runs the merge set and counts an unreadable answer as unusable', async () => {
    const answers = Array.from({ length: 14 }, (_, index) =>
      index === 0 ? 'Same card.' : '{"merges":[]}',
    );
    const router = new ModelRouter({ 'model-a': answers });

    await runLab(
      labParts({ outputDir: out(), router }),
      runOf('summariser/merge', 'v2', 'summariser-merge'),
    );
    const [results] = await writtenResults(out());

    expect(results?.cases.filter((each) => !each.usable)).toHaveLength(1);
    expect(results?.cases[0]).toMatchObject({ detail: 'Unusable', validFirstTry: false });
  });

  it('RF-1406 runs a reader set: the first turn is classified without a tool loop', async () => {
    const router = new ModelRouter({ 'model-a': Array.from({ length: 16 }, () => '{"cards":[]}') });

    await runLab(
      labParts({ outputDir: out(), router }),
      runOf('reader/read-first', 'v1', 'reader-read-first'),
    );
    const [results] = await writtenResults(out());

    expect(results?.cases).toHaveLength(16);
    expect(results?.cases.every((each) => each.detail === 'Answered' && each.calls === 1)).toBe(
      true,
    );
  });
});
