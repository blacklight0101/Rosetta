import type {
  EvaluationCodeMap,
  EvaluationEstimate,
  EvaluationFiles,
  EvaluationOutput,
  EvaluationRun,
  EvaluationTarget,
} from '../../src/application/eval/evaluation-ports.js';
import type { EvaluatedClaim } from '../../src/domain/eval/claim-match.js';
import type { GoldenSet } from '../../src/domain/eval/golden-set.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import { absence, claim, finding, goldenCase } from './eval-fixtures.js';
import type { ManifestRole } from '../../src/domain/runs/run-manifest.js';
import { sampleManifest } from './run-fixtures.js';

// RNF-006, RNF-012, RNF-015, ADR-008: an evaluation target that answers from a script instead of
// running scans and models, and an output that keeps the files in memory, so the evaluation use
// case is tested without a provider, a disk or a clock.

/** Two areas of the golden set's files and a third-party area the cases do not touch. */
const evalCodeMap: EvaluationCodeMap = {
  files: [
    { path: 'Default.aspx.cs', lines: 58 },
    { path: 'Models/Item.cs', lines: 62 },
    { path: 'Scripts/jquery.js', lines: 9000 },
  ],
  areas: [
    { name: '(root)', files: ['Default.aspx.cs'] },
    { name: 'Models', files: ['Models/Item.cs'] },
    { name: 'Scripts', files: ['Scripts/jquery.js'] },
  ],
};

/** One case on `Models/Item.cs` and one on `Default.aspx.cs`, with one rule each. */
export const evalGoldenSet: GoldenSet = {
  schemaVersion: 1,
  version: '2026-10-17.1',
  description: 'A golden set for the use case tests.',
  source: {
    url: 'https://github.com/octo/demo',
    owner: 'octo',
    repo: 'demo',
    commit: 'c'.repeat(40),
    subpath: '',
  },
  cases: [
    goldenCase(),
    goldenCase({
      id: 'home-page',
      paths: ['Default.aspx.cs'],
      findings: [
        finding({ id: 'rule-page-size', evidence: ['Default.aspx.cs:15-16'], keywords: ['ten'] }),
      ],
      absences: [absence({ id: 'absent-login', claimPatterns: [['sign in']] })],
    }),
  ],
};

/** A role of a manifest, as an Ollama model whose version is not known yet. */
function role(model: string): ManifestRole {
  return {
    ...{ provider: 'ollama', kind: 'ollama', model, modelVersion: null, modelDigest: null },
    ...{ contextTokens: null, contextSource: null, toolMode: 'native' },
    ...{ maxOutputTokens: 4096, temperature: null, maxTurns: 12 },
  };
}

/** The manifest of an understand run with a reader and a verifier of known versions. */
function evalManifest(runId: string, readerVersion: string): RunManifest {
  return sampleManifest({
    runId,
    stage: 'understand',
    endState: 'Completed',
    roles: {
      reader: { ...role('reader-model'), modelVersion: readerVersion },
      verifier: { ...role('judge-model'), modelVersion: 'judge-model-2026-01-01' },
    },
    promptVersions: {
      'reader/area.v2.md': { version: 'v2', sha256: 'a'.repeat(64) },
      'cards/card-format.v1.md': { version: 'v1', sha256: 'b'.repeat(64) },
    },
  });
}

/** A run of the script: its claims, cost and model version. */
export function evalRun(
  n: number,
  claims: readonly EvaluatedClaim[],
  costMicros: number | null = 110_000,
): EvaluationRun {
  const runId = `20261017-10000${String(n)}-understand`;
  return {
    runId,
    endState: 'Completed',
    errorCode: null,
    manifest: evalManifest(runId, n === 3 ? 'reader-model-0002' : 'reader-model-0001'),
    claims,
    costMicros,
  };
}

/** Three runs: all right, one wrong, and one that also finds the page-size rule. */
export function threeRuns(): EvaluationRun[] {
  const right = claim({ claimId: 'BR-001.c1', text: 'The price has two decimals.' });
  const wrong = claim({ claimId: 'BR-002.c1', text: 'An automatic reorder runs nightly.' });
  const page = claim({
    claimId: 'FEAT-001.c1',
    text: 'The page shows ten items.',
    citations: ['Default.aspx.cs:15-16'],
  });
  return [evalRun(1, [right]), evalRun(2, [right, wrong]), evalRun(3, [right, page], 90_000)];
}

interface Script {
  readonly codeMap?: EvaluationCodeMap;
  readonly estimate?: EvaluationEstimate;
  readonly runs: readonly EvaluationRun[];
}

export class FakeEvaluationTarget implements EvaluationTarget {
  readonly calls: string[] = [];
  private readonly script: Script;
  private next = 0;

  constructor(script: Script) {
    this.script = script;
  }

  scan(): Promise<EvaluationCodeMap> {
    this.calls.push('scan');
    return Promise.resolve(this.script.codeMap ?? evalCodeMap);
  }

  estimate(areas: readonly string[]): Promise<EvaluationEstimate> {
    this.calls.push(`estimate ${areas.join(',')}`);
    const figure = { likelyMicros: 100_000, highMicros: 200_000, priced: true };
    return Promise.resolve(this.script.estimate ?? figure);
  }

  understand(areas: readonly string[]): Promise<EvaluationRun> {
    this.calls.push(`understand ${areas.join(',')}`);
    const run = this.script.runs[this.next];
    this.next += 1;
    if (run === undefined) return Promise.reject(new Error('The script has no more runs'));
    return Promise.resolve(run);
  }
}

export class MemoryEvaluationOutput implements EvaluationOutput {
  readonly written: EvaluationFiles[] = [];

  write(files: EvaluationFiles): Promise<string> {
    this.written.push(files);
    return Promise.resolve(`eval-out/${files.folder}`);
  }
}
