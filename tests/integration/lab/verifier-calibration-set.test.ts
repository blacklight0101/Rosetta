import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitsOf } from '../../../src/application/lab/capture/held-back.js';
import { parseLabCaseSet } from '../../../src/application/lab/lab-case-set.js';
import { sha256Hex } from '../../../src/infrastructure/lab/run-folder.js';

// RF-1411, RF-305, RF-1405: the lab's verifier set is the 30 hand-labelled claims of the
// calibration set over the synthetic webforms-shop fixture, split by the fixed rule on the input.

const root = fileURLToPath(new URL('../../../', import.meta.url));

interface CalibrationClaim {
  readonly id: string;
  readonly text: string;
  readonly citations: readonly string[];
  readonly supported: boolean;
}

async function load() {
  const calibration = JSON.parse(
    await readFile(`${root}eval/calibration/webforms-shop.json`, 'utf8'),
  ) as { claims: CalibrationClaim[] };
  const parsed = parseLabCaseSet(
    JSON.parse(await readFile(`${root}lab/cases/verifier-claim-calibration.json`, 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.error.join('; '));
  return { claims: calibration.claims, set: parsed.value };
}

interface VerifierInput {
  readonly claim: string;
  readonly citations: string[];
  readonly files: Record<string, string>;
}

describe('the verifier calibration case set', () => {
  it('RF-1411 holds the 30 claims of the calibration set with their hand labels', async () => {
    const { claims, set } = await load();

    expect(set.prompt).toBe('verifier/claim');
    expect(set.cases.map((each) => each.id)).toEqual(claims.map((each) => each.id));
    expect(set.cases.map((each) => each.expected)).toEqual(
      claims.map((each) => (each.supported ? 'Supported' : 'Rejected')),
    );
  });

  it('RF-1411 gives each case the claim, its citations and the whole cited files', async () => {
    const { claims, set } = await load();
    const problems: string[] = [];

    for (const [index, each] of set.cases.entries()) {
      const input = each.input as VerifierInput;
      const claim = claims[index];
      if (input.claim !== claim?.text) problems.push(`${each.id}: claim`);
      if (JSON.stringify(input.citations) !== JSON.stringify(claim?.citations)) {
        problems.push(`${each.id}: citations`);
      }
      for (const [path, text] of Object.entries(input.files)) {
        const fixture = await readFile(`${root}tests/fixtures/repos/webforms-shop/${path}`, 'utf8');
        if (fixture !== text) problems.push(`${each.id}: ${path} differs from the fixture`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('RF-1411 holds back the cases the fixed rule picks, with both labels on both sides', async () => {
    const { set } = await load();
    const rule = splitsOf(
      set.cases.map((each) => each.input),
      sha256Hex,
    );
    const count = (side: string, label: string): number =>
      set.cases.filter((each) => each.split === side && each.expected === label).length;

    expect(set.cases.map((each) => each.split)).toEqual(rule);
    expect(count('held-back', 'Supported')).toBeGreaterThanOrEqual(2);
    expect(count('held-back', 'Rejected')).toBeGreaterThanOrEqual(2);
    expect(count('tune', 'Supported')).toBeGreaterThanOrEqual(2);
    expect(count('tune', 'Rejected')).toBeGreaterThanOrEqual(2);
  });
});
