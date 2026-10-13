// FAKE SECRETS ONLY (RNF-003). The command-line shapes added by P1-134 (RF-141), built at run time
// from harmless pieces like those of secret-fixture.ts, which joins them to its cases, innocent
// texts and hostile pieces. Each case keeps a harmless neighbour (a user, a path, a file or a
// database name) that must stay visible next to the masked value.

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
const token = `Tk${fakeValue(20)}`;
const tail = `Tail${fakeValue(12)}`;
const shortToken = `Tk${fakeValue(8)}`;
const doubleDash = ['-', '-'].join('');
const passwordOption = `${doubleDash}password`;
const tokenOption = `${doubleDash}token`;
const mysqlExe = String.raw`"C:\Program Files\MySQL\bin\mysql.exe"`;
const toolExe = String.raw`"C:\Program Files\tool.exe"`;

/** One case per shape of P1-134, in the order of the card: quoted exe, quoted database, redirect. */
export const commandSecretCases: readonly ShapeCase[] = [
  {
    name: 'a mysql -p password after a quoted executable path',
    kind: 'password',
    text: `${mysqlExe} -u root -p${password}`,
    masked: `${mysqlExe} -u root -p[MASKED:password]`,
    secrets: [password],
  },
  {
    name: 'a --password option after a quoted executable path',
    kind: 'password',
    text: `${toolExe} ${passwordOption} ${password} --verbose`,
    masked: `${toolExe} ${passwordOption} [MASKED:password] --verbose`,
    secrets: [password],
  },
  {
    name: 'a mysql -p password after a double-quoted database name',
    kind: 'password',
    text: `mysql "shop data" -u root -p${password}`,
    masked: 'mysql "shop data" -u root -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysql -p password after a single-quoted database name that follows the options',
    kind: 'password',
    text: `mysql -u root 'shop data' -p${password}`,
    masked: "mysql -u root 'shop data' -p[MASKED:password]",
    secrets: [password],
  },
  {
    name: 'a quoted --password value after a quoted database name',
    kind: 'password',
    text: `tool "shop data" ${passwordOption} "${password} ${tail}"`,
    masked: `tool "shop data" ${passwordOption} [MASKED:password]`,
    secrets: [password, tail],
  },
  {
    name: 'a mysqldump -p password after an output redirect',
    kind: 'password',
    text: `mysqldump catalog > out.sql -u root -p${password}`,
    masked: 'mysqldump catalog > out.sql -u root -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysql -p password after an input redirect',
    kind: 'password',
    text: `mysql -u root < dump.sql -p${password}`,
    masked: 'mysql -u root < dump.sql -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysql -p password after an &> redirect',
    kind: 'password',
    text: `mysql &> out.sql -u root -p${password}`,
    masked: 'mysql &> out.sql -u root -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a mysqldump -p password after a >| redirect',
    kind: 'password',
    text: `mysqldump catalog >| out.sql -u root -p${password}`,
    masked: 'mysqldump catalog >| out.sql -u root -p[MASKED:password]',
    secrets: [password],
  },
  {
    name: 'a short --token value after the scheme word Bearer',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer ${shortToken} --verbose`,
    masked: `tool ${tokenOption} Bearer [MASKED:bearer-token] --verbose`,
    secrets: [shortToken],
  },
  {
    name: 'a --token option after a redirect',
    kind: 'bearer-token',
    text: `tool > out.txt ${tokenOption} ${token}`,
    masked: `tool > out.txt ${tokenOption} [MASKED:bearer-token]`,
    secrets: [token],
  },
  {
    name: 'a --token= option',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=${token} > out.txt`,
    masked: `tool ${tokenOption}=[MASKED:bearer-token] > out.txt`,
    secrets: [token],
  },
];

/** Text close to the new shapes that is not a secret. */
export const commandInnocentTexts: readonly string[] = [
  'mysql "shop data" -u root -p',
  `${mysqlExe} -u root -p`,
  'mysqldump catalog > out.sql -u root',
  `tool ${passwordOption}`,
  `tool ${passwordOption} -u root`,
  `tool ${tokenOption}-file token.txt > out.txt`,
  `tool ${passwordOption}-file secret.txt`,
  `tool ${doubleDash}no-password > out.txt`,
  `x${tokenOption} abc`,
  `${doubleDash}${tokenOption} abc`,
];

/** Hostile pieces for the new patterns (RF-141 linear time), built from pieces like the cases. */
export const commandAdversarialPieces: readonly string[] = [
  'mysql" ',
  'mysql "a" ',
  "mysql 'a ",
  'mysql > a ',
  'mysql < ',
  'mysql -u a 2> ',
  `${passwordOption} `,
  `${passwordOption} "`,
  `${tokenOption}=`,
  `${tokenOption} '`,
];
