import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { overviewTarget } from '../../../../src/application/lab/targets/overview-target.js';
import { verifierClaimTarget } from '../../../../src/application/lab/targets/verifier-claim-target.js';
import {
  loadLabCaseSet,
  loadLabConfig,
  loadPromptVersion,
} from '../../../../src/infrastructure/lab/lab-files.js';
import { labFolder } from '../../../support/lab-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1400, RF-1401, RF-1402, DEC-231: the committed settings and sample sets are valid, and a prompt
// version is a numbered file or a draft.

const temp = useTempRoot('rosetta-lab-files-');
const retry = {
  name: 'verifier/retry.v1.md',
  version: 'v1',
  sha256: '0'.repeat(64),
  text: '{{problem}}',
};

describe('the committed lab files', () => {
  it('RF-1402 the settings hold the phase caps of DEC-231: $50 in total, a stop line at $40', async () => {
    const config = await loadLabConfig(labFolder);

    expect(config).toMatchObject({
      ok: true,
      value: { totalCapMicros: 50_000_000, stopMicros: 40_000_000 },
    });
  });

  it('RF-1401 every case of the sample sets is read by the target of its prompt', async () => {
    const targets = [verifierClaimTarget(retry), overviewTarget()];

    for (const name of ['verifier-claim-sample', 'overview-sample']) {
      const loaded = await loadLabCaseSet(labFolder, name);
      if (!loaded.ok) throw new Error(loaded.error);
      const target = targets.find((each) => each.id === loaded.value.set.prompt);
      const problems = loaded.value.set.cases.map((each) => target?.parseInput(each.input));

      expect(target).toBeDefined();
      expect(problems.every((each) => each?.ok === true)).toBe(true);
    }
  });

  it('RF-1401 refuses a name that is not a case set of lab/cases', async () => {
    expect((await loadLabCaseSet(labFolder, '../config')).ok).toBe(false);
    expect((await loadLabCaseSet(labFolder, 'no-such-set')).ok).toBe(false);
  });
});

describe('the local case sets of the lab', () => {
  const set = (version: string): string =>
    JSON.stringify({
      schemaVersion: 1,
      version,
      prompt: 'summariser/overview',
      description: 'local',
      cases: [{ id: 'a-1', input: {} }],
    });

  it('RF-1405 reads a set of lab/local-cases when lab/cases has none of that name', async () => {
    await mkdir(join(temp.path, 'local-cases'), { recursive: true });
    await writeFile(join(temp.path, 'local-cases', 'mine.json'), set('local-1'));

    const loaded = await loadLabCaseSet(temp.path, 'mine');

    expect(loaded.ok ? loaded.value.set.version : loaded.error).toBe('local-1');
  });

  it('RF-1405 prefers the committed set when both folders hold the name', async () => {
    await mkdir(join(temp.path, 'local-cases'), { recursive: true });
    await mkdir(join(temp.path, 'cases'), { recursive: true });
    await writeFile(join(temp.path, 'local-cases', 'both.json'), set('local-1'));
    await writeFile(join(temp.path, 'cases', 'both.json'), set('committed-1'));

    const loaded = await loadLabCaseSet(temp.path, 'both');

    expect(loaded.ok ? loaded.value.set.version : loaded.error).toBe('committed-1');
  });
});

describe('the prompt versions of the lab', () => {
  it('RF-1400 reads vN from the prompts folder with its hash, and a draft file as version file', async () => {
    const numbered = await loadPromptVersion('prompts', 'verifier/claim', 'v5');
    const draftPath = join(temp.path, 'my-draft.md');
    await writeFile(draftPath, 'A draft.\n');
    const draft = await loadPromptVersion('prompts', 'verifier/claim', draftPath);

    expect(numbered).toMatchObject({
      ok: true,
      value: { name: 'verifier/claim.v5.md', version: 'v5' },
    });
    expect(draft).toMatchObject({
      ok: true,
      value: { name: 'my-draft.md', version: 'file', text: 'A draft.\n' },
    });
  });

  it('RF-1400 refuses a version that does not exist and a draft that holds a data block marker', async () => {
    const marked = join(temp.path, 'marked.md');
    await writeFile(marked, '<<<ROSETTA-DATA abc {}\n');

    expect((await loadPromptVersion('prompts', 'verifier/claim', 'v99')).ok).toBe(false);
    expect((await loadPromptVersion('prompts', 'verifier/claim', marked)).ok).toBe(false);
  });
});
