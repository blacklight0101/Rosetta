import { byCodeUnit } from '../code-map/code-unit-order.js';
import {
  httpMethods,
  noApiContract,
  plannerErrorStatuses,
  reservedSchemaNames,
  type ApiAssembly,
  type ApiDraft,
  type ApiLeftOut,
  type ApiOperation,
  type DraftOperation,
  type HttpMethod,
  type UnservedCard,
} from './api-contract.js';
import { isApiPath, isOperationId, pathSignature } from './api-contract-paths.js';
import type { ModelTable, TargetDataModel } from './data-model.js';

// RF-624, RF-603, ADR-013: the planner's draft of the API made into the operations the contract
// holds. An operation is kept only when it has an identifier for a name, a known method, a path of
// plain segments, a summary and at least one verified `FEAT` or `FLOW` card to serve; a repeated
// operation id or route is left out. An operation that carries a table is never public, whatever the
// planner says. Every card no operation serves is listed with a reason, never silently dropped.

const noOperationReason =
  'The planner wrote no operation for this card and gave no reason; confirm whether it needs the API.';
const noApiReason = 'The planner found no public API to describe for the chosen front end.';
const unusableReason =
  'The planner answer for the API contract had no usable operation, so no contract was written; plan again to try once more.';

/** Mutable counters of what was left out; local to one assembly. */
type Tally = { -readonly [K in keyof ApiLeftOut]: number };

interface Context {
  readonly servable: ReadonlySet<string>;
  readonly tables: readonly ModelTable[];
  readonly tally: Tally;
}

/** The table built from this `ENT` card: the one with the fewest sources, then by name. */
function tableOf(entity: string | null, tables: readonly ModelTable[]): string | null {
  if (entity === null) return null;
  const built = tables
    .filter((table) => table.sources.includes(entity) && !reservedSchemaNames.includes(table.name))
    .sort((a, b) => a.sources.length - b.sources.length || byCodeUnit(a.name, b.name));
  return built[0]?.name ?? null;
}

function methodOf(method: string): HttpMethod | undefined {
  const lower = method.trim().toLowerCase();
  return httpMethods.find((known) => known === lower);
}

function statusesOf(errors: readonly number[]): number[] {
  const allowed: readonly number[] = plannerErrorStatuses;
  return [...new Set(errors.filter((status) => allowed.includes(status)))].sort((a, b) => a - b);
}

/** The operation as the contract holds it, or undefined when a check refuses it. */
function checked(draft: DraftOperation, context: Context): ApiOperation | undefined {
  const method = methodOf(draft.method);
  const summary = draft.summary.trim();
  const path = draft.path;
  if (method === undefined || summary === '') return undefined;
  if (!isOperationId(draft.operationId) || !isApiPath(path)) return undefined;
  const asked = new Set(draft.serves);
  const known = [...asked].filter((id) => context.servable.has(id));
  if (known.length === 0) return undefined;
  context.tally.serves += asked.size - known.length;
  const schema = tableOf(draft.entity, context.tables);
  if (draft.public && schema !== null) context.tally.security += 1;
  return {
    ...{ operationId: draft.operationId, method, path, summary },
    ...{ serves: known.sort(byCodeUnit), public: draft.public && schema === null },
    ...{ schema, list: draft.list, errors: statusesOf(draft.errors) },
  };
}

function inRouteOrder(a: ApiOperation, b: ApiOperation): number {
  const byPath = byCodeUnit(a.path, b.path);
  return byPath === 0 ? httpMethods.indexOf(a.method) - httpMethods.indexOf(b.method) : byPath;
}

/** The first of each operation id and each route, in the order of the draft. */
function keptOperations(draft: ApiDraft, context: Context): ApiOperation[] {
  const ids = new Set<string>();
  const routes = new Set<string>();
  const kept: ApiOperation[] = [];
  for (const each of draft.operations) {
    const operation = checked(each, context);
    const route =
      operation === undefined ? '' : `${operation.method} ${pathSignature(operation.path)}`;
    if (operation === undefined || routes.has(route) || ids.has(operation.operationId)) {
      context.tally.operations += 1;
      continue;
    }
    ids.add(operation.operationId);
    routes.add(route);
    kept.push(operation);
  }
  return kept.sort(inRouteOrder);
}

/** The cards no kept operation serves, in card order, with the planner's reason when it gave one. */
function unservedCards(
  draft: ApiDraft,
  operations: readonly ApiOperation[],
  servable: readonly string[],
): UnservedCard[] {
  const served = new Set(operations.flatMap((operation) => operation.serves));
  const reasons = new Map<string, string>();
  for (const { card, reason } of draft.notServed) {
    if (reason.trim() !== '' && !reasons.has(card)) reasons.set(card, reason.trim());
  }
  return servable
    .filter((id) => !served.has(id))
    .map((cardId) => {
      const reason = reasons.get(cardId);
      return reason === undefined
        ? { cardId, reason: noOperationReason, byPlanner: false }
        : { cardId, reason, byPlanner: true };
    });
}

// RF-624
export function assembleApiContract(
  draft: ApiDraft | undefined,
  servable: readonly string[],
  model: TargetDataModel,
): ApiAssembly {
  const tally: Tally = { operations: 0, serves: 0, security: 0 };
  if (draft === undefined) {
    return { contract: noApiContract(unusableReason), readable: false, leftOut: tally };
  }
  if (!draft.applies) {
    const reason = draft.reason.trim() === '' ? noApiReason : draft.reason.trim();
    return { contract: noApiContract(reason), readable: true, leftOut: tally };
  }
  const context = { servable: new Set(servable), tables: model.tables, tally };
  const operations = keptOperations(draft, context);
  if (operations.length === 0) {
    return { contract: noApiContract(unusableReason), readable: false, leftOut: tally };
  }
  const unserved = unservedCards(draft, operations, servable);
  return { contract: { kind: 'openapi', operations, unserved }, readable: true, leftOut: tally };
}
