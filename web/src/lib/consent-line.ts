import { priceTableText } from './money.js';
import { providerNames } from '../pages/provider-choices.js';

// RF-143, DEC-209 (P8-81), artboard P8Deepen: the one line a page shows while a consent of the
// project holds: the day it was given, the providers it names and the day it ends, in UTC like the
// other dates the pages show.

/** `3 Nov 2026` from an ISO instant. */
function dayText(instant: string): string {
  return priceTableText(instant.slice(0, 10));
}

// RF-143
export function consentLineText(consent: {
  readonly givenAt: string;
  readonly endsAt: string;
  readonly providers: readonly string[];
}): string {
  const given = dayText(consent.givenAt);
  const providers = providerNames(consent.providers);
  return `You agreed on ${given} to send masked excerpts of your own code from this project to ${providers}. It lasts until ${dayText(consent.endsAt)}, or until a role's provider changes.`;
}
