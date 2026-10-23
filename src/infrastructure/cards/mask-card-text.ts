import type { Card, Claim } from '../../domain/cards/card.js';
import type { Citation } from '../../domain/cards/citation.js';
import type { CitedText, ScreenAction, ScreenField } from '../../domain/cards/flow-screen.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-141, RF-508, P3-127: every string of a card is masked here, once, before any of it is quoted,
// escaped or drawn. A marker is escaped as a label like any other text and cannot change a
// diagram, and a card file is never masked after it is rendered (the escaped marker would be read
// as a value, and the masker would eat the backslash of a closing quote).

type Mask = (text: string) => string;

function citationOf(citation: Citation, mask: Mask): Citation {
  return { ...citation, path: mask(citation.path) };
}

function citedOf<T extends CitedText>(item: T, mask: Mask): T {
  return {
    ...item,
    text: mask(item.text),
    citations: item.citations.map((citation) => citationOf(citation, mask)),
  };
}

function fieldOf(field: ScreenField, mask: Mask): ScreenField {
  return {
    ...field,
    name: mask(field.name),
    inputKind: mask(field.inputKind),
    validations: field.validations.map((item) => citedOf(item, mask)),
  };
}

function actionOf(action: ScreenAction, mask: Mask): ScreenAction {
  return {
    label: mask(action.label),
    ...(action.handler === undefined ? {} : { handler: mask(action.handler) }),
    ...(action.flow === undefined ? {} : { flow: mask(action.flow) }),
  };
}

function claimOf(claim: Claim, mask: Mask): Claim {
  const { verdict } = claim;
  return {
    ...citedOf(claim, mask),
    claimId: mask(claim.claimId),
    ...(verdict === undefined
      ? {}
      : {
          verdict: {
            ...verdict,
            reason: mask(verdict.reason),
            model: mask(verdict.model),
            at: mask(verdict.at),
          },
        }),
    ...(claim.target === undefined ? {} : { target: mask(claim.target) }),
    ...(claim.replaces === undefined ? {} : { replaces: mask(claim.replaces) }),
    ...(claim.branches === undefined
      ? {}
      : { branches: claim.branches.map((branch) => citedOf(branch, mask)) }),
  };
}

function cardOf(card: Card, mask: Mask): Card {
  return {
    ...card,
    id: mask(card.id),
    title: mask(card.title),
    summary: mask(card.summary),
    area: mask(card.area),
    agentTaskId: mask(card.agentTaskId),
    claims: card.claims.map((claim) => claimOf(claim, mask)),
    ...(card.question === undefined ? {} : { question: mask(card.question) }),
    ...(card.whyItMatters === undefined ? {} : { whyItMatters: mask(card.whyItMatters) }),
    ...(card.note === undefined ? {} : { note: mask(card.note) }),
    ...(card.mergedFrom === undefined ? {} : { mergedFrom: card.mergedFrom.map(mask) }),
    ...(card.mergedAreas === undefined ? {} : { mergedAreas: card.mergedAreas.map(mask) }),
    ...(card.flow === undefined
      ? {}
      : { flow: { trigger: mask(card.flow.trigger), outcome: mask(card.flow.outcome) } }),
    ...(card.screen === undefined
      ? {}
      : {
          screen: {
            route: mask(card.screen.route),
            roles: card.screen.roles.map(mask),
            fields: card.screen.fields.map((field) => fieldOf(field, mask)),
            actions: card.screen.actions.map((action) => actionOf(action, mask)),
            leadsTo: card.screen.leadsTo.map(mask),
          },
        }),
  };
}

/** The cards with every string masked (ids, citation paths, text, verdicts, flow and screen). */
export function maskCardText(cards: readonly Card[], masker: TextMasker): readonly Card[] {
  const mask: Mask = (text) => masker.mask(text).text;
  return cards.map((card) => cardOf(card, mask));
}

/** One card with every string masked. */
export function maskCard(card: Card, masker: TextMasker): Card {
  return cardOf(card, (text) => masker.mask(text).text);
}
