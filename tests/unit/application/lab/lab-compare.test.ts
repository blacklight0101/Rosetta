import { describe, expect, it } from 'vitest';
import {
  compareLab,
  parseLabResults,
  summariseLab,
  type LabCaseResult,
  type LabResults,
} from '../../../../src/application/lab/lab-results.js';

// RF-1403: the metrics of an invocation and the side-by-side comparison of two of them.

function caseResult(id: string, over: Partial<LabCaseResult> = {}): LabCaseResult {
  return {
    caseId: id,
    repetition: 1,
    split: 'tune',
    expected: 'Supported',
    detail: 'Supported',
    answer: 'Reason: x\nVerdict: Supported',
    usable: true,
    validFirstTry: true,
    repaired: false,
    refused: false,
    rstCode: null,
    agreed: true,
    calls: 1,
    inputTokens: 400,
    outputTokens: 30,
    latencyMs: 200,
    costMicros: 460,
    ...over,
  };
}

function run(
  version: string,
  cases: readonly LabCaseResult[],
  setSha = 'a'.repeat(64),
): LabResults {
  return {
    schemaVersion: 1,
    id: `20261113-100000-lab-${version}`,
    at: '2026-11-13T10:00:00.000Z',
    rosettaVersion: '1.2.3-test',
    prompt: {
      id: 'verifier/claim',
      name: `verifier/claim.${version}.md`,
      version,
      sha256: version.padEnd(64, '0'),
    },
    model: { provider: 'fake', model: 'model-a', modelVersion: 'model-a-2026' },
    caseSet: { version: 'sample-1', sha256: setSha },
    repetitions: 1,
    planned: cases.length,
    endState: 'Completed',
    refusal: null,
    cases: [...cases],
  };
}

const repaired = { validFirstTry: false, repaired: true, calls: 2, inputTokens: 900 } as const;
const unusable = {
  usable: false,
  validFirstTry: false,
  detail: 'Unverified',
  agreed: false,
  calls: 2,
} as const;
const refused = {
  ...{ refused: true, rstCode: 'RST-1600', usable: false, validFirstTry: false, agreed: false },
  ...{ calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, latencyMs: 0 },
} as const;

const current = run('v5', [
  caseResult('c1'),
  caseResult('c2', { ...repaired, outputTokens: 60, costMicros: 920 }),
  caseResult('c3', unusable),
  caseResult('c4', refused),
]);

describe('the lab summary', () => {
  it('RF-1403 states the rates of first-try validity, repairs, refusals and errors', () => {
    const summary = summariseLab(current);

    expect(summary).toMatchObject({
      cases: 4,
      firstTryRate: 0.25,
      repairedRate: 0.25,
      refusedCount: 1,
      errorsByCode: { 'RST-1600': 1 },
      agreementRate: 0.5,
      costMicros: 460 + 920 + 460,
    });
  });

  it('RF-1403 gives the mean tokens and latency per call', () => {
    const summary = summariseLab(current);

    expect(summary.calls).toBe(5);
    expect(summary.meanInputTokens).toBe((400 + 900 + 400) / 5);
    expect(summary.meanLatencyMs).toBe(600 / 5);
  });

  it('RF-1403 has no rate for a run of no case', () => {
    expect(summariseLab(run('v1', [])).firstTryRate).toBeNull();
  });

  it('RF-1403 counts first-try validity only where it applies, and has no rate where it never does', () => {
    const firstTurn = {
      validFirstTry: null,
      detail: 'Empty',
      usable: false,
      agreed: null,
    } as const;
    const none = run('v1', [caseResult('c1', firstTurn), caseResult('c2', firstTurn)]);
    const mixed = run('v1', [
      caseResult('c1'),
      caseResult('c2', unusable),
      caseResult('c3', firstTurn),
    ]);

    expect(summariseLab(none)).toMatchObject({ firstTryRate: null, invalidRate: 1 });
    expect(summariseLab(mixed).firstTryRate).toBe(0.5);
    const written = { ...none, prompt: { ...none.prompt, sha256: '0'.repeat(64) } };
    expect(parseLabResults(JSON.parse(JSON.stringify(written))).ok).toBe(true);
  });
});

describe('the lab comparison', () => {
  it('RF-1403 puts two versions side by side on the same cases', () => {
    const next = run('v6', [
      caseResult('c1'),
      caseResult('c2'),
      caseResult('c3', { detail: 'Rejected', agreed: false }),
      caseResult('c4'),
    ]);

    const compared = compareLab(current, next);

    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    expect(compared.value.a.version).toBe('v5');
    expect(compared.value.b.version).toBe('v6');
    expect(compared.value.cases.map((each) => each.caseId)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(compared.value.cases[1]?.a?.repaired).toBe(true);
    expect(compared.value.cases[1]?.b?.validFirstTry).toBe(true);
    expect(compared.value.b.summary.firstTryRate).toBe(1);
  });

  it('RF-1403 refuses two runs of different case sets', () => {
    const other = run('v6', [caseResult('c1')], 'b'.repeat(64));

    const compared = compareLab(current, other);

    expect(compared.ok).toBe(false);
    expect(compared.ok ? '' : compared.error).toContain('case set');
  });
});

describe('the lab comparison of case selections', () => {
  const selected = (selection: { split: 'tune' | 'held-back' | 'all'; sample: number | null }) => ({
    ...run('v5', [caseResult('c1')]),
    selection,
  });

  it('RF-1409 refuses two runs over different case selections and names both', () => {
    const compared = compareLab(
      selected({ split: 'tune', sample: 2 }),
      selected({ split: 'tune', sample: null }),
    );

    expect(compared.ok).toBe(false);
    const error = compared.ok ? '' : compared.error;
    expect(error).toContain('split tune, sample 2');
    expect(error).toContain('split tune');
    expect(error).toContain('selection');
  });

  it('RF-1409 compares two runs over the same selection and a run with no recorded selection as every case', () => {
    const same = { split: 'tune', sample: 2 } as const;
    const all = { split: 'all', sample: null } as const;

    expect(compareLab(selected(same), selected(same)).ok).toBe(true);
    expect(compareLab(run('v5', [caseResult('c1')]), selected(all)).ok).toBe(true);
    expect(compareLab(run('v5', [caseResult('c1')]), selected(same)).ok).toBe(false);
  });

  it('RF-1409 keeps the selection a results file records', () => {
    const one = selected({ split: 'held-back', sample: 3 });
    const hashed = { ...one, prompt: { ...one.prompt, sha256: '0'.repeat(64) } };
    const written = JSON.parse(JSON.stringify(hashed)) as Record<string, unknown>;

    const parsed = parseLabResults(written);

    expect(parsed.ok && parsed.value.selection).toEqual({ split: 'held-back', sample: 3 });
    const later = { ...written, selection: { split: 'later', sample: null } };
    expect(parseLabResults(later).ok).toBe(false);
  });
});
