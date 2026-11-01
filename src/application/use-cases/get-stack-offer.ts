import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { legacyFactsOf } from '../../domain/planning/application-kind.js';
import type { StackData } from '../../domain/planning/stack-data.js';
import {
  stackOfferFor,
  type LayerOffer,
  type OfferInput,
} from '../../domain/planning/stack-offer.js';
import { planSourceRun } from '../plan/plan-source.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';

// P7-29, RF-609, RF-645, DEC-172, DEC-203: the options Plan setup shows for each stack layer before
// the consent to send code excerpts. They come from the catalogue alone, for the application kind and
// the legacy languages of the scan the source run read, so no code is sent. A workbook source needs no
// scan; a source with no readable scan lists no proposal (the layer then says the catalogue has none).

export interface GetStackOfferDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly scans: ScanResults;
  readonly stack: StackData;
}

export interface GetStackOfferRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly runId?: string;
}

const unknown: OfferInput = { kind: 'keep', languages: [], extensions: [], workbook: false };

export class GetStackOffer {
  private readonly deps: GetStackOfferDependencies;

  constructor(deps: GetStackOfferDependencies) {
    this.deps = deps;
  }

  // RF-609, RF-645, RF-1105
  async execute(
    request: GetStackOfferRequest,
  ): Promise<Result<readonly LayerOffer[], typeof ERROR_CODES.notFound>> {
    const { userId } = request.actor;
    const project = await this.deps.projects.find(userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    if (project.sourceKind === 'workbook') {
      // A workbook has no application to read: the web defaults of the catalogue, no keep-legacy.
      const input: OfferInput = { kind: 'web', languages: [], extensions: [], workbook: true };
      return ok(stackOfferFor(input, this.deps.stack));
    }
    return ok(stackOfferFor(await this.inputOf(userId, request), this.deps.stack));
  }

  private async inputOf(userId: string, request: GetStackOfferRequest): Promise<OfferInput> {
    const { runs, scans, stack } = this.deps;
    const owner = { userId, projectId: request.projectId };
    const source = await planSourceRun(runs, owner, request.runId);
    if (!source.ok || source.value.snapshotKey === null) return unknown;
    const { snapshotKey } = source.value;
    const scan = (await runs.list(userId, request.projectId)).find(
      (each) =>
        each.stage === 'scan' && each.endState === 'Completed' && each.snapshotKey === snapshotKey,
    );
    if (scan === undefined) return unknown;
    try {
      const facts = legacyFactsOf((await scans.open(scan)).codeMap, stack.proposals.signals);
      return {
        kind: facts.detected?.kind ?? 'web',
        languages: facts.languages,
        extensions: facts.extensions,
        workbook: false,
      };
    } catch {
      return unknown;
    }
  }
}
