import type { Result } from '../../domain/errors/result.js';
import type {
  ProviderProblem,
  ProviderSetFactory,
  ProviderSetRequest,
} from '../ports/provider-set-factory.js';
import type { ProviderSet } from '../providers/provider-set.js';
import { UNDERSTAND_ROLES } from './understand-options.js';

// RF-250, RF-405: the reader is required; the summariser is wanted for the merge of duplicate cards.
// When only the summariser cannot be served (no key, unpriced model, no consent), the run goes on
// with the reader alone and the cards of the areas stay as the readers wrote them.

/** The set of the reader and the summariser, or of the reader alone when only the summariser fails. */
export async function buildUnderstandRoles(
  factory: ProviderSetFactory,
  request: Omit<ProviderSetRequest, 'roles'>,
): Promise<Result<ProviderSet, readonly ProviderProblem[]>> {
  const both = await factory.build({ ...request, roles: [...UNDERSTAND_ROLES, 'summariser'] });
  if (both.ok || both.error.some((problem) => problem.role !== 'summariser')) return both;
  return factory.build({ ...request, roles: UNDERSTAND_ROLES });
}
