import type { Actor } from '../../domain/accounts/actor.js';
import type { ConsentNeed, ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-143, RF-132, RF-142, DEC-209: the consent a start of an understand run, a plan run or a
// Deepen runs under. With no non-local role nothing is needed. A consent of the project that holds
// is used and the boxes are not asked again. Otherwise the request must carry the consent (RST-1515)
// and, for an uploaded project, the private-code confirmation (RST-1521); a start that carries them
// gives a new consent on the project. The run records the consent's id (`consentId`), so each run
// names the consent it ran under. A retry that carries the consent its run recorded (P7-38) starts
// under it but gives no new one: only the owner's own tick starts the 30 days again.

interface NeedRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly need: ConsentNeed;
}

/** DEC-209: the consent that holds, and giving one (the consent use cases). */
export interface StartConsents {
  readonly held: { execute(request: NeedRequest): Promise<ProjectConsent | undefined> };
  readonly give: { execute(request: NeedRequest): Promise<ProjectConsent> };
}

export interface StartConsentInput {
  readonly actor: Actor;
  readonly projectId: string;
  /** What the start needs a consent for; undefined when its roles are all local. */
  readonly need: ConsentNeed | undefined;
  /** RF-143: the consent the request carries (or the run it retries recorded, `carried`). */
  readonly cloudConsent: boolean;
  /** RF-132: the private-code confirmation the request carries. */
  readonly privateCodeConfirmed: boolean;
  /** P7-38: the consent came from the run a retry retries, not from the owner's tick. */
  readonly carried?: boolean;
}

/** What the run records of its consent (RF-142). */
export interface SettledConsent {
  readonly cloudConsent: boolean;
  readonly privateCodeConfirmed: boolean;
  readonly consentId?: string;
}

type ConsentRefusal =
  typeof ERROR_CODES.cloudConsentMissing | typeof ERROR_CODES.privateCodeNotConfirmed;

function underConsent(consent: ProjectConsent, need: ConsentNeed): SettledConsent {
  const privateCodeConfirmed = need.kinds.includes('private-code');
  return { cloudConsent: true, privateCodeConfirmed, consentId: consent.id };
}

function refusalOf(input: StartConsentInput, need: ConsentNeed): ConsentRefusal | undefined {
  if (!input.cloudConsent) return ERROR_CODES.cloudConsentMissing;
  const needsPrivate = need.kinds.includes('private-code');
  return needsPrivate && !input.privateCodeConfirmed
    ? ERROR_CODES.privateCodeNotConfirmed
    : undefined;
}

// RF-143, DEC-209
export async function settleConsent(
  consents: StartConsents | undefined,
  input: StartConsentInput,
): Promise<Result<SettledConsent, ConsentRefusal>> {
  const { need, actor, projectId } = input;
  if (need === undefined) {
    return ok({ cloudConsent: input.cloudConsent, privateCodeConfirmed: false });
  }
  const held = await consents?.held.execute({ actor, projectId, need });
  if (held !== undefined) return ok(underConsent(held, need));
  const refusal = refusalOf(input, need);
  if (refusal !== undefined) return err(refusal);
  const privateCodeConfirmed = need.kinds.includes('private-code');
  if (consents === undefined || input.carried === true) {
    return ok({ cloudConsent: true, privateCodeConfirmed });
  }
  return ok(underConsent(await consents.give.execute({ actor, projectId, need }), need));
}
