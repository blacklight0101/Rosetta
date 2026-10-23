// P5-14, RF-208, DEC-18: the small slips of a reader answer that are repaired here instead of by a
// model retry. A detail object the card type does not need, or a list the schema lets be empty,
// that the model sent as `null` is read as absent or empty. A SCRN card whose screen detail sits
// on the card itself gets it moved into `screen`. Nothing the schema requires is ever filled in:
// no route, no trigger, no citation, no claim, so a card without evidence stays invalid.

type Plain = Readonly<Record<string, unknown>>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Detail fields a card carries only for its type, and the type that needs each. */
const detailNeededBy: Readonly<Record<string, string>> = {
  question: 'OQ',
  whyItMatters: 'OQ',
  flow: 'FLOW',
  screen: 'SCRN',
};
/** The lists of a screen the schema reads as empty when they are absent. */
const screenLists = ['roles', 'fields', 'actions', 'leadsTo'] as const;
/** What a claim may carry that is optional. */
const claimOptionals: ReadonlySet<string> = new Set(['target', 'branches']);

function typeOf(card: Plain): string {
  const type = card['type'];
  return typeof type === 'string' ? type.trim().toUpperCase() : '';
}

/** `null` for a detail the card type does not need is the same as leaving it out. */
function withoutNullDetails(card: Plain): Plain {
  const type = typeOf(card);
  return Object.fromEntries(
    Object.entries(card).filter(([key, value]) => {
      const needed = detailNeededBy[key];
      return !(value === null && needed !== undefined && needed !== type);
    }),
  );
}

/** The screen detail written on the card (`route`, `fields`, ...) moved into `screen`. */
function withLiftedScreen(card: Plain): Plain {
  if (typeOf(card) !== 'SCRN' || isPlain(card['screen']) || typeof card['route'] !== 'string') {
    return card;
  }
  const lifted = ['route', ...screenLists].filter((key) => card[key] !== undefined);
  const screen = Object.fromEntries(lifted.map((key) => [key, card[key]]));
  const rest = Object.entries(card).filter(([key]) => !lifted.includes(key));
  return { ...Object.fromEntries(rest), screen };
}

function withEmptyLists(list: Plain, keys: readonly string[]): Plain {
  return Object.fromEntries(
    Object.entries(list).map(([key, value]) => [
      key,
      value === null && keys.includes(key) ? [] : value,
    ]),
  );
}

function withFilledScreen(card: Plain): Plain {
  const found = card['screen'];
  if (!isPlain(found)) return card;
  const screen = withEmptyLists(found, screenLists);
  const fields = screen['fields'];
  const filled = Array.isArray(fields)
    ? fields.map((field: unknown) =>
        isPlain(field) ? withEmptyLists(field, ['validations']) : field,
      )
    : fields;
  return { ...card, screen: { ...screen, fields: filled } };
}

function withoutNullClaimOptionals(card: Plain): Plain {
  const claims = card['claims'];
  if (!Array.isArray(claims)) return card;
  return {
    ...card,
    claims: claims.map((claim: unknown) =>
      isPlain(claim)
        ? Object.fromEntries(
            Object.entries(claim).filter(
              ([key, value]) => !(value === null && claimOptionals.has(key)),
            ),
          )
        : claim,
    ),
  };
}

/** The card object with the repairable slips repaired; anything else is returned as it came. */
// RF-208
export function fillOptionalObjects(item: unknown): unknown {
  if (!isPlain(item)) return item;
  return withoutNullClaimOptionals(withFilledScreen(withLiftedScreen(withoutNullDetails(item))));
}
