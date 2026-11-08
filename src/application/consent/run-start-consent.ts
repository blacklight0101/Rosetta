import type { Actor } from '../../domain/accounts/actor.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { Project } from '../projects/project.js';
import { scopeOf } from '../runs/run-scope.js';
import { readUnderstandOptions } from '../understand/understand-options.js';
import { consentNeedOf } from './consent-need.js';
import { settleConsent, type StartConsents } from './start-consent.js';

// RF-143, RF-132, DEC-209, P7-38: the consent a start of an understand or plan run runs under
// (`POST /api/projects/:id/runs`): a consent of the project that holds, or the boxes the request
// carries for the roles the stage calls. A retry also takes the consent its run recorded.

export interface RunStartConsentDependencies {
  readonly runs: Pick<RunIndex, 'find'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly consents?: StartConsents;
  readonly ollamaHost?: string;
}

interface RunStartConsentRequest {
  readonly actor: Actor;
  readonly cloudConsent?: boolean;
  readonly privateCodeConfirmed?: boolean;
  readonly retryOf?: string;
}

/**
 * P7-38: a retry takes the cloud consent recorded in the manifest of the run it retries, read here
 * and never from the browser's figure, which only counts where that run recorded none (the owner
 * ticks the notice for this retry). A recorded consent is never removed by the browser.
 */
async function recordedConsentOf(
  deps: RunStartConsentDependencies,
  request: RunStartConsentRequest,
): Promise<boolean> {
  const ticked = request.cloudConsent === true;
  if (request.retryOf === undefined) return ticked;
  const parent = await deps.runs.find(request.actor.userId, request.retryOf);
  if (parent === undefined) return ticked;
  const manifest = await deps.manifests.read(scopeOf(parent));
  const recorded =
    manifest === undefined ? false : readUnderstandOptions(manifest.options).cloudConsent;
  return recorded || ticked;
}

// RF-143, RF-132, DEC-209
export async function runStartConsent(
  deps: RunStartConsentDependencies,
  request: RunStartConsentRequest,
  project: Project,
  roles: readonly AgentRole[],
): ReturnType<typeof settleConsent> {
  const recorded = await recordedConsentOf(deps, request);
  return settleConsent(deps.consents, {
    ...{ actor: request.actor, projectId: project.id },
    need: consentNeedOf(project, deps.ollamaHost, roles),
    ...{ cloudConsent: recorded, privateCodeConfirmed: request.privateCodeConfirmed === true },
    carried: recorded && request.cloudConsent !== true,
  });
}
