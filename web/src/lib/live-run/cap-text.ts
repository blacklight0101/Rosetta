// RF-422, RF-1106, DEC-107 (P3-91): the words of a cap that stopped a call. Scaffolding only.

/** The message of a `budget.capReached` event: the cap, its amount and who can raise it. */
export function capReachedText(data: Readonly<Record<string, unknown>>): string {
  throw new Error(`P3-91: the cap text of ${String(data.scope)} is not implemented.`);
}
