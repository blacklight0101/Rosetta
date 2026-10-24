import { ROUTE_FILE_END, detailKindOf } from '../../domain/cards/screen-claims.js';
import type { CitedExcerpt } from './cited-lines.js';
import type { FieldVerdict } from './screen-field-check.js';

// P5-31, P3-122, RF-626, ADR-005: the route claim of a page whose route is its file path ("The
// screen is at the route /Web/Contact.aspx, the path of its page file.", citing the page directive of that file alone) says
// one thing the code can settle: the route is the path of the one file the claim cites. It is
// decided here, with no call. A route claim of any other form (several ranges, another path, a
// file the scan did not read) is not decided here and goes to the model as before.

const PREFIX = 'The screen is at the route ';

function routeOf(text: string): string | undefined {
  if (detailKindOf(text) !== 'route' || !text.endsWith(ROUTE_FILE_END)) return undefined;
  return text.slice(PREFIX.length, -ROUTE_FILE_END.length);
}

function formOf(path: string): string {
  const slashed = path.trim().replaceAll('\\', '/').replace(/^~/u, '');
  return (slashed.startsWith('/') ? slashed : `/${slashed}`).toLowerCase();
}

// RF-626
export function screenRouteVerdict(
  claim: { readonly text: string },
  excerpts: readonly CitedExcerpt[],
): FieldVerdict | undefined {
  const route = routeOf(claim.text);
  const [only] = excerpts;
  if (route === undefined || only === undefined || excerpts.length !== 1 || only.skipped) {
    return undefined;
  }
  if (formOf(route) !== formOf(only.path)) return undefined;
  return {
    status: 'Supported',
    reason: `The route is the path of the cited page ${only.path}.`,
  };
}
