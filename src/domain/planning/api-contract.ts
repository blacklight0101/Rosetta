import type { SourceCard } from './plan-sources.js';
import type { PlanningBrief } from './planning-brief.js';

// RF-624, RF-603, DEC-134: the API contract of the hand-off package. The draft is what the planner
// answers (untrusted model output, ADR-013); the contract is what is written once
// `assembleApiContract` has checked it against the verified cards and the target data model. The
// contract is a list of operations, each naming the `FEAT` or `FLOW` cards it serves; the OpenAPI
// document is generated from it by code (openapi-document.ts), never written by the model.

export const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof httpMethods)[number];

/** The error statuses the planner may add to an operation; 401 and 500 are added by the code. */
export const plannerErrorStatuses = [400, 403, 404, 409, 422, 429] as const;

export interface DraftOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  /** `FEAT` or `FLOW` card ids the operation serves. */
  readonly serves: readonly string[];
  /** True for an operation that needs no sign-in (a sign-in itself, a health check). */
  readonly public: boolean;
  /** The `ENT` card whose table is the body of the operation; null for none. */
  readonly entity: string | null;
  /** True when the response is a list of the entity. */
  readonly list: boolean;
  readonly errors: readonly number[];
}

interface DraftNotServed {
  readonly card: string;
  readonly reason: string;
}

export interface ApiDraft {
  /** False when the chosen front end is rendered by the server and no public API exists. */
  readonly applies: boolean;
  /** Why no contract applies; empty when one does. */
  readonly reason: string;
  readonly operations: readonly DraftOperation[];
  readonly notServed: readonly DraftNotServed[];
}

export interface ApiOperation {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly summary: string;
  /** Sorted card ids, at least one. */
  readonly serves: readonly string[];
  readonly public: boolean;
  /** The name of the target table whose schema is the body; null for none. */
  readonly schema: string | null;
  readonly list: boolean;
  /** Sorted statuses the planner added, from `plannerErrorStatuses`. */
  readonly errors: readonly number[];
}

/** A `FEAT` or `FLOW` card no operation serves. */
export interface UnservedCard {
  readonly cardId: string;
  readonly reason: string;
  /** False when the planner named no operation and gave no reason, so the code listed it. */
  readonly byPlanner: boolean;
}

export type ApiContract =
  | { readonly kind: 'none'; readonly reason: string }
  | {
      readonly kind: 'openapi';
      readonly operations: readonly ApiOperation[];
      readonly unserved: readonly UnservedCard[];
    };

/** How many items of the draft the contract leaves out, for the log. */
export interface ApiLeftOut {
  readonly operations: number;
  readonly serves: number;
  /** Operations that asked to be public although they carry data; they stay signed in. */
  readonly security: number;
}

export interface ApiAssembly {
  readonly contract: ApiContract;
  /** False when the answer was unusable (no readable answer, or no operation survived). */
  readonly readable: boolean;
  readonly leftOut: ApiLeftOut;
}

export type ApiScope = { readonly ask: true } | { readonly ask: false; readonly reason: string };

/** The supported `FEAT` and `FLOW` cards, the ones an operation can serve. */
// RF-624
export function servableCards(cards: readonly SourceCard[]): SourceCard[] {
  return cards.filter((card) => card.type === 'FEAT' || card.type === 'FLOW');
}

/** The contract that says no API applies, with the reason. */
// RF-624
export function noApiContract(reason: string): ApiContract {
  return { kind: 'none', reason };
}

/** The schema names the code keeps for itself; a table of that name gets no schema. */
export const reservedSchemaNames: readonly string[] = ['ApiError'];

const noFrontEnd =
  'The planning brief names no front end, so it is not known whether one is separate from the back end. Choose a front end in the plan setup and plan again to get a contract.';
const noFeature =
  'The verified cards hold no verified feature or flow, so there is no operation to describe.';

/** Whether the planner is asked for the contract, or the reason it is not. */
// RF-624
export function apiScope(cards: readonly SourceCard[], brief: PlanningBrief): ApiScope {
  const frontEnd = brief.stack.find((entry) => entry.layer === 'front-end')?.choice.trim() ?? '';
  if (frontEnd === '') return { ask: false, reason: noFrontEnd };
  if (servableCards(cards).length === 0) return { ask: false, reason: noFeature };
  return { ask: true };
}
