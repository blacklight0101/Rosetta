// RF-623, RF-603: the grammar of the names and types in the target data model. The model's answer
// is untrusted text, and the package must hold no executable DDL, so a table or column name is an
// identifier and a type is a type name with an optional precision, nothing longer. That grammar is
// the control (an allowlist of shapes); the statement words refused after it are a second line,
// and the invariant they protect is "a type cell is a type name, never a statement".

const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const typeName = /^[A-Za-z][A-Za-z ]{0,38}(?:\((?:\d{1,5}(?:,\d{1,3})?|max)\))?(?:\[\])?$/iu;
const statementWords =
  /\b(?:create|alter|drop|insert|update|delete|select|grant|revoke|truncate|table|index|exec|execute)\b/iu;

/** What a column shows as its type when the planner's type is not a type name. */
export const unconfirmedType = 'to confirm';

// RF-623
export function isIdentifier(name: string): boolean {
  return identifier.test(name);
}

/** The type as written when it is a type name; otherwise `unconfirmedType`. */
// RF-623, RF-603
export function typeOrUnconfirmed(type: string): string {
  const trimmed = type.trim().replace(/ {2,}/gu, ' ');
  return typeName.test(trimmed) && !statementWords.test(trimmed) ? trimmed : unconfirmedType;
}
