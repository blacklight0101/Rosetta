// FAKE SECRETS ONLY (RNF-003). Every value below is built at run time from harmless pieces such as
// "FAKE0", so the repository holds no secret-like literal and none of them was ever a credential.
// Shared by the masker tests (RF-141), the logger tests (RF-009) and the egress guard (P1-28).

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';
import {
  commandAdversarialPieces,
  commandInnocentTexts,
  commandSecretCases,
} from './secret-command-shapes.js';
import {
  continuationAdversarialPieces,
  continuationInnocentTexts,
  continuationSecretCases,
} from './secret-continuation-shapes.js';
import { gapAdversarialPieces, gapInnocentTexts, gapSecretCases } from './secret-gap-shapes.js';
import {
  precisionAdversarialPieces,
  precisionInnocentTexts,
  precisionSecretCases,
} from './secret-precision-shapes.js';
import { moreAdversarialPieces, moreInnocentTexts, moreSecretCases } from './secret-shapes.js';

export interface SecretCase {
  readonly name: string;
  readonly kind: SecretKind;
  /** Content that holds the fake secret. */
  readonly text: string;
  /** Exactly what the masker must return. */
  readonly masked: string;
  /** The fake values that must never appear after masking. */
  readonly secrets: readonly string[];
}

const dash = '-';
/** A FAKE OpenAI project key, for the OpenAI adapter tests (RF-402). */
export const fakeOpenAiKey = ['sk', 'proj', fakeValue(40)].join(dash);
/** A FAKE Anthropic key, for the Anthropic adapter tests (RF-404). */
export const fakeAnthropicKey = ['sk', 'ant', 'api03', fakeValue(48)].join(dash);
const githubToken = ['ghp', fakeValue(36)].join('_');
const githubPat = ['github', 'pat', fakeValue(30)].join('_');
const awsKeyId = ['AK', 'IA', fakeValue(16)].join('');
const bearerToken = [fakeValue(24), fakeValue(30), fakeValue(20)].join('.');
const fakePassword = `Pw${fakeValue(14)}`;
const fakePasswordTail = `Tail${fakeValue(12)}`;
const keyLines = [fakeValue(64), fakeValue(64), fakeValue(20)];
const pemBegin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const pemEnd = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
/** The first line of a PKCS#8 key block, built from pieces (also the start of an unterminated block). */
export const pkcs8Begin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const pkcs8End = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');

/** One case per secret pattern of RF-141. */
export const secretCases: readonly SecretCase[] = [
  {
    name: 'an OpenAI key (sk-)',
    kind: 'api-key',
    text: `OPENAI_API_KEY=${fakeOpenAiKey}`,
    masked: 'OPENAI_API_KEY=[MASKED:api-key]',
    secrets: [fakeOpenAiKey],
  },
  {
    name: 'an Anthropic key (sk-ant-) in source code',
    kind: 'api-key',
    text: `const client = new Client({ apiKey: "${fakeAnthropicKey}" });`,
    masked: 'const client = new Client({ apiKey: "[MASKED:api-key]" });',
    secrets: [fakeAnthropicKey],
  },
  {
    name: 'a GitHub token (ghp_)',
    kind: 'api-key',
    text: `export GH_TOKEN=${githubToken}`,
    masked: 'export GH_TOKEN=[MASKED:api-key]',
    secrets: [githubToken],
  },
  {
    name: 'a GitHub fine-grained token (github_pat_) in a URL',
    kind: 'api-key',
    text: `git clone https://${githubPat}@github.com/octo/demo.git`,
    masked: 'git clone https://[MASKED:api-key]@github.com/octo/demo.git',
    secrets: [githubPat],
  },
  {
    name: 'an AWS access key id (AKIA)',
    kind: 'api-key',
    text: `aws_access_key_id = ${awsKeyId}`,
    masked: 'aws_access_key_id = [MASKED:api-key]',
    secrets: [awsKeyId],
  },
  {
    name: 'a bearer token in a header',
    kind: 'bearer-token',
    text: `Authorization: Bearer ${bearerToken}`,
    masked: 'Authorization: Bearer [MASKED:bearer-token]',
    secrets: [bearerToken],
  },
  {
    name: 'a short bearer token with punctuation in a header',
    kind: 'bearer-token',
    text: 'Authorization: Bearer abc.def-ghi!jkl',
    masked: 'Authorization: Bearer [MASKED:bearer-token]',
    secrets: ['abc.def-ghi!jkl', 'ghi!jkl'],
  },
  {
    name: 'a password in a connection URL',
    kind: 'connection-string',
    text: `DATABASE_URL=postgres://rosetta:${fakePassword}@localhost:5432/rosetta`,
    masked: 'DATABASE_URL=postgres://rosetta:[MASKED:connection-string]@localhost:5432/rosetta',
    secrets: [fakePassword],
  },
  {
    name: 'a password in a connection URL with an empty user name',
    kind: 'connection-string',
    text: `REDIS_URL=redis://:${fakePassword}@cache:6379/0`,
    masked: 'REDIS_URL=redis://:[MASKED:connection-string]@cache:6379/0',
    secrets: [fakePassword],
  },
  {
    name: 'a connection URL password that contains @',
    kind: 'connection-string',
    text: `amqp://app:${fakePassword}@${fakePasswordTail}@broker:5672/`,
    masked: 'amqp://app:[MASKED:connection-string]@broker:5672/',
    secrets: [fakePassword, fakePasswordTail],
  },
  {
    name: 'a Password setting in an ADO.NET connection string',
    kind: 'connection-string',
    text: `Server=db;Database=Catalog;User Id=sa;Password=${fakePassword};`,
    masked: 'Server=db;Database=Catalog;User Id=sa;Password=[MASKED:connection-string];',
    secrets: [fakePassword],
  },
  {
    name: 'a Pwd setting in an ODBC connection string',
    kind: 'connection-string',
    text: `Driver={SQL Server};Server=db;Uid=app; Pwd = ${fakePassword}`,
    masked: 'Driver={SQL Server};Server=db;Uid=app; Pwd = [MASKED:connection-string]',
    secrets: [fakePassword],
  },
  {
    name: 'a connection string password inside a JSON string value',
    kind: 'connection-string',
    text: `{ "ConnectionStrings": { "Catalog": "Server=db;User Id=sa;Password=${fakePassword};" } }`,
    masked:
      '{ "ConnectionStrings": { "Catalog": "Server=db;User Id=sa;Password=[MASKED:connection-string];" } }',
    secrets: [fakePassword],
  },
  {
    name: 'a password= setting',
    kind: 'password',
    text: `smtp.password=${fakePassword}`,
    masked: 'smtp.password=[MASKED:password]',
    secrets: [fakePassword],
  },
  {
    name: 'a pwd= setting with spaces',
    kind: 'password',
    text: `pwd = ${fakePassword}`,
    masked: 'pwd = [MASKED:password]',
    secrets: [fakePassword],
  },
  {
    name: 'a password property split from its key across a JSON string',
    kind: 'password',
    text: `{ "DbPassword": "${fakePassword} with spaces" }`,
    masked: '{ "DbPassword": "[MASKED:password]" }',
    secrets: [fakePassword],
  },
  {
    name: 'a JSON password with an escaped quote inside the value',
    kind: 'password',
    text: `{"password":"${fakePassword}\\"${fakePasswordTail}"}`,
    masked: '{"password":"[MASKED:password]"}',
    secrets: [fakePassword, fakePasswordTail],
  },
  {
    name: 'a password in YAML',
    kind: 'password',
    text: `database:\n  password: ${fakePassword}\n  user: app`,
    masked: 'database:\n  password: [MASKED:password]\n  user: app',
    secrets: [fakePassword],
  },
  // Before the key blocks: the unterminated one masks everything after it in the whole fixture.
  ...moreSecretCases,
  ...gapSecretCases,
  ...commandSecretCases,
  ...continuationSecretCases,
  ...precisionSecretCases,
  {
    name: 'a multi-line private key block',
    kind: 'private-key',
    text: ['line one', pemBegin, ...keyLines, pemEnd, 'line seven'].join('\n'),
    masked: ['line one', '[MASKED:private-key]', '', '', '', '', 'line seven'].join('\n'),
    secrets: keyLines,
  },
  {
    name: 'a private key split across a JSON string with escaped line breaks',
    kind: 'private-key',
    text: `{ "type": "service_account", "private_key": "${[pkcs8Begin, ...keyLines, pkcs8End].join('\\n')}\\n" }`,
    masked: '{ "type": "service_account", "private_key": "[MASKED:private-key]\\n" }',
    secrets: keyLines,
  },
  {
    name: 'a private key block cut off before its end line',
    kind: 'private-key',
    text: ['config', pemBegin, ...keyLines].join('\r\n'),
    masked: ['config', '[MASKED:private-key]', '', '', ''].join('\r\n'),
    secrets: keyLines,
  },
];

/** Text that looks close to a secret but is not one; the masker leaves it unchanged. */
export const innocentTexts: readonly string[] = [
  'const passwordHash = hash(input);',
  'if (password == expected) { return true; }',
  'pip install sk-learn',
  'task-1234567890123456789012345 finished',
  'The bearer of this note may pass.',
  'See https://example.com/docs:8080/path for details.',
  'AKIA is not a key on its own',
  ...moreInnocentTexts,
  ...gapInnocentTexts,
  ...commandInnocentTexts,
  ...continuationInnocentTexts,
  ...precisionInnocentTexts,
];

/**
 * Shapes that make a backtracking pattern scan the rest of the input from every position (RF-141).
 * Each secret-like prefix is built from pieces, like the cases above, so none appears as a literal.
 */
export const adversarialPieces: readonly string[] = [
  pkcs8End,
  `A\n${pkcs8End}`,
  ['-----END', ''].join(' '),
  'a.b-c',
  ['sk', ''].join(dash),
  'a-pwd',
  'password',
  ['pwd', ''].join('='),
  'password \t',
  'x://',
  'a://:',
  ':@',
  '@',
  'Bearer ',
  [';pwd', ''].join('='),
  '; ',
  ['-----BEGIN', 'RSA', ''].join(' '),
  pkcs8Begin,
  ['ghp', 'aaaa'].join('_'),
  ['github', 'pat', ''].join('_'),
  ['AK', 'IA'].join(''),
  ['password', '"\\'].join('='),
  ['"password"', '"'].join(':'),
  ['pwd', "'a\\'"].join('='),
  ['pwd', '"\\"'].join('='),
  ...moreAdversarialPieces,
  ...gapAdversarialPieces,
  ...commandAdversarialPieces,
  ...continuationAdversarialPieces,
  ...precisionAdversarialPieces,
];

export interface KeyedSecretCase {
  readonly name: string;
  /** Object-shaped tool-call arguments whose secret sits under a password-like property name. */
  readonly arguments: Readonly<Record<string, unknown>>;
  /** The fake values that must never appear after masking. */
  readonly secrets: readonly string[];
}

const keyedPassword = (tag: string): string => `Pw${tag}${fakeValue(12)}`;

/** RF-141, RF-408: secrets whose only clue is the property name that holds them. */
export const keyedSecretCases: readonly KeyedSecretCase[] = [
  {
    name: 'a password property',
    arguments: { user: 'app', password: keyedPassword('A') },
    secrets: [keyedPassword('A')],
  },
  { name: 'a pwd property', arguments: { pwd: keyedPassword('B') }, secrets: [keyedPassword('B')] },
  {
    name: 'a password property in a nested object',
    arguments: { db: { connection: { Password: keyedPassword('C') } } },
    secrets: [keyedPassword('C')],
  },
  {
    name: 'a password property of an object inside an array',
    arguments: { accounts: [{ name: 'smtp', smtpPassword: keyedPassword('D') }] },
    secrets: [keyedPassword('D')],
  },
  {
    name: 'a password with quotes, spaces and a line break',
    arguments: { passwd: `${keyedPassword('E')} "quoted" text\nnext` },
    secrets: [keyedPassword('E'), 'quoted'],
  },
  { name: 'a numeric password', arguments: { password: 73915820 }, secrets: ['73915820'] },
];
