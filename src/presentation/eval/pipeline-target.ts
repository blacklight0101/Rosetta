import type {
  EvaluationCodeMap,
  EvaluationEstimate,
  EvaluationRun,
  EvaluationTarget,
} from '../../application/eval/evaluation-ports.js';
import type { EstimateRun } from '../../application/estimate/estimate-run.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunEventSink, RunScope } from '../../application/ports/run-events.js';
import type { RunIndex } from '../../application/ports/run-index.js';
import type { RunManifestStore } from '../../application/ports/run-manifest-store.js';
import type { ScanResults } from '../../application/ports/scan-results.js';
import { scopeOf } from '../../application/runs/run-scope.js';
import type { StartRun } from '../../application/use-cases/start-run.js';
import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import type { Run } from '../../domain/runs/run.js';
import { readRunClaims, readRunCost } from '../../infrastructure/eval/run-claims.js';

// RNF-006, RNF-012, RNF-015, ADR-003, ADR-007: the evaluation target over the real run queue. A
// scan and each `understand` run are started as the API starts them (StartRun, SubmitRun, the
// queue and its executors), so every model call goes through the provider factory, the egress
// guard and the budget guard; the estimate is the start page's (EstimateRun). The target waits
// for the `run.ended` event and then reads the run row, its manifest, cards and cost report.

/** Resolves when a run has published `run.ended`; remembers runs that ended before anyone waited. */
export class RunEndWatcher implements RunEventSink {
  /** The error code of each ended run (null when it ended without one). */
  private readonly ended = new Map<string, string | null>();
  private readonly waiting = new Map<string, (code: string | null) => void>();

  publish(scope: RunScope, event: RunEvent): Promise<void> {
    if (event.type === 'run.ended') {
      const code = event.data['errorCode'];
      const errorCode = typeof code === 'string' ? code : null;
      this.ended.set(scope.id, errorCode);
      this.waiting.get(scope.id)?.(errorCode);
    }
    return Promise.resolve();
  }

  /** Resolves with the run's error code once it has ended. */
  until(runId: string): Promise<string | null> {
    const code = this.ended.get(runId);
    if (code !== undefined) return Promise.resolve(code);
    return new Promise((resolve) => this.waiting.set(runId, resolve));
  }
}

export interface PipelineTargetParts {
  readonly actor: Actor;
  readonly projectId: string;
  readonly startRun: StartRun;
  readonly estimateRun: EstimateRun;
  readonly scans: ScanResults;
  readonly runs: Pick<RunIndex, 'find'>;
  readonly manifests: RunManifestStore;
  readonly writer: OutputWriter;
  readonly watcher: RunEndWatcher;
}

function failed(code: string, message: string): RosettaError {
  const known = Object.values(ERROR_CODES).find((value) => value === code);
  return new RosettaError(known ?? ERROR_CODES.unexpected, message);
}

// RNF-006
export class PipelineTarget implements EvaluationTarget {
  private readonly parts: PipelineTargetParts;

  constructor(parts: PipelineTargetParts) {
    this.parts = parts;
  }

  async scan(): Promise<EvaluationCodeMap> {
    const { run, errorCode } = await this.start({ stage: 'scan' });
    if (run.endState !== 'Completed') {
      const code = errorCode ?? ERROR_CODES.unexpected;
      throw failed(
        code,
        `The scan of the golden set's source ended ${String(run.endState)} (${code}).`,
      );
    }
    const { codeMap } = await this.parts.scans.open(run);
    return {
      files: codeMap.files.map((file) => ({ path: file.path, lines: file.lines })),
      areas: codeMap.areas.map((area) => ({ name: area.name, files: area.files })),
    };
  }

  async estimate(areas: readonly string[]): Promise<EvaluationEstimate> {
    const { actor, projectId } = this.parts;
    const estimate = await this.parts.estimateRun.execute({ actor, projectId, areas });
    if (!estimate.ok) throw failed(estimate.error, `The estimate failed (${estimate.error}).`);
    const { total, roles } = estimate.value;
    return {
      likelyMicros: Number(total.likely.costMicros),
      highMicros: Number(total.high.costMicros),
      priced: roles.every((role) => role.priced),
    };
  }

  async understand(areas: readonly string[]): Promise<EvaluationRun> {
    // RF-143: the owner consented with `--yes` after the command showed the models and the source.
    const { run, errorCode } = await this.start({ stage: 'understand', areas, cloudConsent: true });
    const scope = scopeOf(run);
    const { writer, manifests } = this.parts;
    return {
      runId: run.runKey,
      endState: run.endState,
      errorCode,
      manifest: await manifests.read(scope),
      claims: await readRunClaims(writer, scope),
      costMicros: await readRunCost(writer, scope),
    };
  }

  /** Starts a run as the API does and answers its row once it has ended. */
  private async start(request: {
    readonly stage: 'scan' | 'understand';
    readonly areas?: readonly string[];
    readonly cloudConsent?: boolean;
  }): Promise<{ readonly run: Run; readonly errorCode: string | null }> {
    const { actor, projectId, startRun, watcher, runs } = this.parts;
    const started = await startRun.execute({ actor, projectId, ...request });
    if (!started.ok)
      throw failed(started.error, `The ${request.stage} run was refused (${started.error}).`);
    const errorCode = await watcher.until(started.value.run.id);
    const run = await runs.find(actor.userId, started.value.run.id);
    if (run === undefined) throw failed(ERROR_CODES.unexpected, 'The run is gone.');
    return { run, errorCode };
  }
}
