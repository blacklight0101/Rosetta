// FAKE SECRETS ONLY (RNF-003). The secret shapes added by P1-124 (RF-141), built at run time from
// harmless pieces like those of secret-fixture.ts, which joins them to its cases, innocent texts
// and hostile pieces.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

const password = `Pw${fakeValue(14)}`;
const tail = `Tail${fakeValue(12)}`;
const cdataOpen = ['<!', 'CDATA', ''].join('[');
const cdataClose = [']]', ''].join('>');

/** One case per shape of P1-124, in the order of the card. */
export const gapSecretCases: readonly ShapeCase[] = [
  {
    name: 'a mysql -p password after two positional words',
    kind: 'password',
    text: `mysql catalog orders -u root -p${password}`,
    masked: 'mysql catalog orders -u root -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysql -p password after a database name that follows the options',
    kind: 'password',
    text: `mysql -u root catalog -p${password}`,
    masked: 'mysql -u root catalog -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysqldump -p password between a database, a table and a redirect',
    kind: 'password',
    text: `mysqldump catalog orders -u app -p${password} > orders.sql`,
    masked: 'mysqldump catalog orders -u app -p[MASKED:password] > orders.sql',
    secrets: [password],
  },
  {
    name: 'a double-quoted mysql -p password that contains a space',
    kind: 'password',
    text: `mysql -u root -p"${password} ${tail}" catalog`,
    masked: 'mysql -u root -p[MASKED:password] catalog',
    secrets: [password, tail],
  },
  {
    name: 'a single-quoted mysql -p password that contains a space',
    kind: 'password',
    text: `mysql -u root -p'${password} ${tail}'`,
    masked: 'mysql -u root -p[MASKED:password]',
    secrets: [password, tail],
  },
  {
    name: 'an XML password element whose value starts with a space',
    kind: 'password',
    text: `<password> ${password} with spaces</password>`,
    masked: '<password> [MASKED:password]</password>',
    secrets: [password],
  },
  {
    name: 'an XML password element with a CDATA section',
    kind: 'password',
    text: `<add><DbPassword>${cdataOpen}${password} <&> ${tail}${cdataClose}</DbPassword></add>`,
    masked: `<add><DbPassword>${cdataOpen}[MASKED:password]${cdataClose}</DbPassword></add>`,
    secrets: [password, tail],
  },
  {
    name: 'an XML password element with a space before its CDATA section',
    kind: 'password',
    text: `<pwd attr="x"> ${cdataOpen}${password}${cdataClose}</pwd>`,
    masked: `<pwd attr="x"> ${cdataOpen}[MASKED:password]${cdataClose}</pwd>`,
    secrets: [password],
  },
];

/** Text close to the new shapes that is not a secret. */
export const gapInnocentTexts: readonly string[] = [
  'mysql is used in many places -pretty often',
  'mysql -u root catalog -p',
  'mysql catalog, orders -pending',
  `${cdataOpen}plain text${cdataClose}`,
  `<note>${cdataOpen}password of the week${cdataClose}</note>`,
];

/** Hostile pieces for the new patterns (RF-141 linear time), built from pieces like the cases. */
export const gapAdversarialPieces: readonly string[] = [
  'mysql a ',
  'mysql -u a b ',
  'mysql a -u ',
  'mysql -p"',
  "mysql -p'",
  ' -p"a',
  '<password> ',
  `<password>${cdataOpen}`,
  `<pwd> ${cdataOpen}a]`,
  `<password>${cdataOpen}]]`,
];
