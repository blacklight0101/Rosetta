// RF-1108, RF-1002: where the user can fix a run that ended with an error code. The words of the
// failure come from the error catalogue (GET /api/errors/:code, error-catalogue.ts); only the
// links belong here.

export interface FixLink {
  readonly href: string;
  readonly label: string;
}

const settings: FixLink = { href: '/settings', label: 'Settings and keys' };

const fixes: Readonly<Record<string, FixLink>> = {
  'RST-2302': settings,
  'RST-1506': settings,
};

/** The page where the user can fix the cause of a code, when there is one. */
// RF-1108
export function fixFor(code: string): FixLink | undefined {
  return Object.hasOwn(fixes, code) ? fixes[code] : undefined;
}

/** What the page says while the catalogue answer is missing, or when the code is unknown to it. */
export const GENERIC_FAILURE = {
  message: 'The run ended with an error.',
  nextStep: 'Look the code up in the error catalogue, or report it.',
} as const;
