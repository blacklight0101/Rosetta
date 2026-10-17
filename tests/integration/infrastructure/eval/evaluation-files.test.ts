import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EvaluationFiles } from '../../../../src/application/eval/evaluation-ports.js';
import { RunEvaluation } from '../../../../src/application/eval/run-evaluation.js';
import { FileEvaluationOutput } from '../../../../src/infrastructure/eval/evaluation-files.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  evalGoldenSet,
  FakeEvaluationTarget,
  MemoryEvaluationOutput,
  threeRuns,
} from '../../../support/eval-target.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RNF-015, RNF-003, data-model.md section 3.19: the files of an evaluation land in a new folder of
// `eval-out/`, checked against their schema and masked; an existing folder is never overwritten.

const temp = useTempRoot('rosetta-eval-files-');

async function files(): Promise<EvaluationFiles> {
  const output = new MemoryEvaluationOutput();
  await new RunEvaluation({
    target: new FakeEvaluationTarget({ runs: threeRuns() }),
    output,
    clock: new FixedClock('2026-10-17T09:30:00.000Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
    extraPrompts: [],
  }).execute({
    goldenSet: evalGoldenSet,
    goldenSetSha256: 'd'.repeat(64),
    repetitions: 3,
    totalCapMicros: 1_000_000,
    settings: {},
  });
  const [written] = output.written;
  if (written === undefined) throw new Error('Nothing was written');
  return written;
}

function output(): FileEvaluationOutput {
  return new FileEvaluationOutput({
    outputDir: join(temp.path, 'eval-out'),
    masker: new SecretMasker(),
  });
}

describe('the evaluation files', () => {
  it('RNF-015 writes experiment.json and results.json into eval-out/<id>/', async () => {
    const folder = await output().write(await files());

    expect(folder).toBe(join(temp.path, 'eval-out', '20260101-000001-eval'));
    const experiment: unknown = JSON.parse(await readFile(join(folder, 'experiment.json'), 'utf8'));
    expect(experiment).toMatchObject({ id: '20260101-000001-eval', repetitions: 3 });
  });

  it('RNF-015 never overwrites an earlier evaluation', async () => {
    const written = await files();
    await output().write(written);

    await expect(output().write(written)).rejects.toThrow();
  });

  it('RNF-015 refuses an id that is not a folder name and files the schema refuses', async () => {
    const written = await files();

    await expect(output().write({ ...written, folder: '../escape' })).rejects.toThrow('id');
    const broken = { ...written.experiment, repetitions: 1 };
    await expect(output().write({ ...written, experiment: broken })).rejects.toThrow(
      'experiment.json',
    );
  });

  it('RNF-003 masks a secret that reached the results through model output', async () => {
    const written = await files();
    const [first, ...rest] = written.results.repetitions;
    if (first === undefined) throw new Error('No repetition');
    const leaked = { ...first.overall, unmatchedClaims: [fakeOpenAiKey] };
    const repetitions = [{ ...first, overall: leaked }, ...rest];

    const folder = await output().write({
      ...written,
      results: { ...written.results, repetitions },
    });

    const text = await readFile(join(folder, 'results.json'), 'utf8');
    expect(text).not.toContain(fakeOpenAiKey);
    expect(text).toContain('[MASKED:');
  });
});

describe('reading golden set files through links', () => {
  it('RNF-006 refuses a file reached through a link out of the eval folder', async () => {
    const outside = join(temp.path, 'outside');
    const evalFolder = join(temp.path, 'eval');
    await mkdir(outside);
    await mkdir(evalFolder);
    await writeFile(join(outside, 'set.json'), '{}');
    await symlink(outside, join(evalFolder, 'linked'), 'junction');

    const loaded = await loadGoldenSet(evalFolder, 'linked/set.json');

    expect(loaded.ok ? '' : loaded.error).toContain('outside');
  });
});
