import type { StackOffer } from '../../api/plan-schemas.js';
import type { Draft } from './draft.js';

// RF-609, DEC-208: the platform of the language and runtime the owner chose, the proposals of that
// platform for the layers below it, and the line for a layer answered with a technology of another
// platform. The platform of each technology comes from the offer (the catalogue), not from this file.

type Technology = StackOffer['layers'][number]['technologies'][number];

const LANGUAGE = 'language-runtime';

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'u').test(text.toLowerCase());
}

function technologyNamed(
  technologies: readonly Technology[],
  choice: string,
): Technology | undefined {
  return technologies.find((each) =>
    [each.name, ...each.aliases].some((term) => mentions(choice, term.toLowerCase())),
  );
}

const technologiesOf = (offer: StackOffer | undefined, layer: string): readonly Technology[] =>
  offer?.layers.find((each) => each.layer === layer)?.technologies ?? [];

/** The language and runtime the owner picked or typed, when it belongs to a platform of the catalogue. */
export function languageOf(
  offer: StackOffer | undefined,
  draft: Draft,
): { readonly name: string; readonly platform: string } | undefined {
  const choice = draft.stack[LANGUAGE]?.choice ?? '';
  if (choice.trim() === '') return undefined;
  const found = technologyNamed(technologiesOf(offer, LANGUAGE), choice);
  return found === undefined ? undefined : { name: found.name, platform: found.platform };
}

/** The layer's proposals for the platform, the recommended first; undefined when there is no platform. */
export function platformProposals(
  offer: StackOffer | undefined,
  layer: string,
  platform: string | undefined,
): readonly { readonly choice: string; readonly why: string }[] | undefined {
  if (platform === undefined) return undefined;
  return offer?.layers
    .find((each) => each.layer === layer)
    ?.platforms.find((each) => each.platform === platform)?.proposals;
}

/** The line for a layer whose answer belongs to another platform than the language's. */
export function platformClashLine(
  offer: StackOffer | undefined,
  draft: Draft,
  layer: string,
): string | undefined {
  const language = languageOf(offer, draft);
  const choice = draft.stack[layer]?.choice ?? '';
  if (language === undefined || layer === LANGUAGE || choice.trim() === '') return undefined;
  const found = technologyNamed(technologiesOf(offer, layer), choice);
  if (found === undefined || found.platform === language.platform) return undefined;
  return `${found.name} is a ${found.platform} technology, and the language is ${language.name}. Keep it only if that is intended; the package will list it as a clash.`;
}
