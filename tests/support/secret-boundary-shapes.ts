// FAKE SECRETS ONLY (RNF-003). The boundary shapes of the P2-40 fix round (RF-141), built at run time
// from harmless pieces like those of secret-fixture.ts, which joins them to its cases: a JWT and a
// dotted value after `api_key`, the 8-character floor of that rule, Bearer values that only look like
// placeholders, and words after `--token=` that are values (only a single blank and a listed prose
// word make it prose).

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

const tokenOption = ['-', '-', 'token'].join('');
const header = 'Authorization: Bearer';
const masked = '[MASKED:bearer-token]';
const letters = ['abcd', '1234', 'efgh'].join('');
const apiKeyName = ['api', 'key'].join('_');
// A JWT-like value built from pieces: three base64url segments, the last one starting with a letter
// and holding no dash (so a words-and-dots test would take it for code).
const jwtHead = ['eyJ', fakeValue(16)].join('');
const jwtBody = ['eyJ', fakeValue(20)].join('');
const jwt = `${jwtHead}.${jwtBody}.Sig${fakeValue(12)}`;
const jwtUnderscore = `${jwtHead}.${jwtBody}._Sig${fakeValue(12)}`;

/** One case per boundary of the P2-40 fix round. */
export const boundarySecretCases: readonly ShapeCase[] = [
  {
    name: 'a JWT after api_key whose signature starts with a letter',
    kind: 'api-key',
    text: `${apiKeyName}=${jwt}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [jwtHead, jwtBody],
  },
  {
    name: 'a JWT after api_key whose signature starts with an underscore',
    kind: 'api-key',
    text: `${apiKeyName}=${jwtUnderscore}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [jwtHead, jwtBody],
  },
  {
    name: 'a three-segment dotted api_key value',
    kind: 'api-key',
    text: `${apiKeyName}=${fakeValue(3)}.${fakeValue(3)}.${fakeValue(6)}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [fakeValue(6)],
  },
  {
    name: 'an api_key value of exactly 8 characters',
    kind: 'api-key',
    text: `${apiKeyName}=${fakeValue(8)}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [fakeValue(8)],
  },
  {
    name: 'an api_key value of 9 characters',
    kind: 'api-key',
    text: `${apiKeyName}=${fakeValue(9)}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [fakeValue(9)],
  },
  {
    name: 'a Bearer value that is a variable-like name in lower case with digits',
    kind: 'bearer-token',
    text: `${header} $abc${fakeValue(10)}`,
    masked: `${header} ${masked}`,
    secrets: [fakeValue(10)],
  },
  {
    name: 'a Bearer value in angle brackets that holds a JWT head',
    kind: 'bearer-token',
    text: `${header} <${jwtHead}>`,
    masked: `${header} ${masked}`,
    secrets: [jwtHead],
  },
  {
    name: 'a Bearer value in braces that holds digits',
    kind: 'bearer-token',
    text: `${header} {s3${fakeValue(8)}}`,
    masked: `${header} ${masked}`,
    secrets: [fakeValue(8)],
  },
  {
    name: 'a --token= word "secret" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= secret`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['secret'],
  },
  {
    name: 'a --token= word "hunter" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= hunter`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['hunter'],
  },
  {
    name: 'a --token= word "ABCDEFGH" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= ABCDEFGH`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['ABCDEFGH'],
  },
  {
    name: 'a --token= word "flags" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= flags`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['flags'],
  },
  {
    name: 'a --token= word "flag1" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= flag1`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['flag1'],
  },
  {
    name: 'a --token= word "x1" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= x1`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['x1'],
  },
  {
    name: 'a --token= word "abcdefghijklm" after one blank is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= abcdefghijklm`,
    masked: `tool ${tokenOption}= ${masked}`,
    secrets: ['abcdefghijklm'],
  },
  {
    name: 'a --token= word "flag" after two blanks is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=  flag`,
    masked: `tool ${tokenOption}=  ${masked}`,
    secrets: ['flag'],
  },
  {
    name: 'a --token= word "flag" after a tab is a value',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=	flag`,
    masked: `tool ${tokenOption}=	${masked}`,
    secrets: ['flag'],
  },
  {
    name: 'a one-dot api_key value that starts like a JWT head',
    kind: 'api-key',
    text: `${apiKeyName}=eyJabcdefghij.Sigabcdefg`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: ['eyJabcdefghij', 'Sigabcdefg'],
  },
  {
    name: 'an api_key value with an environment root and two more segments',
    kind: 'api-key',
    text: `${apiKeyName}=process.env.${fakeValue(6)}.${fakeValue(6)}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [fakeValue(6)],
  },
  {
    name: 'a Bearer value in angle brackets with a letters-only JWT head',
    kind: 'bearer-token',
    text: `${header} <eyJabcdefghij>`,
    masked: `${header} ${masked}`,
    secrets: ['eyJabcdefghij'],
  },
  {
    name: 'a short value after "AUTHORIZATION: BEARER" in that case',
    kind: 'bearer-token',
    text: 'AUTHORIZATION: BEARER abcdefgh',
    masked: 'AUTHORIZATION: BEARER [MASKED:bearer-token]',
    secrets: ['abcdefgh'],
  },
  {
    name: 'a short value after "authorization: bearer" in that case',
    kind: 'bearer-token',
    text: 'authorization: bearer abcdefgh',
    masked: 'authorization: bearer [MASKED:bearer-token]',
    secrets: ['abcdefgh'],
  },
  {
    name: 'a short value after "Authorization: BEARER" in that case',
    kind: 'bearer-token',
    text: 'Authorization: BEARER abcdefgh',
    masked: 'Authorization: BEARER [MASKED:bearer-token]',
    secrets: ['abcdefgh'],
  },
  {
    name: 'an api key setting written as "API_KEY="',
    kind: 'api-key',
    text: `${['API', 'KEY'].join('_')}=${letters}`,
    masked: `${['API', 'KEY'].join('_')}=[MASKED:api-key]`,
    secrets: [letters],
  },
  {
    name: 'an api key setting written as "Api_Key="',
    kind: 'api-key',
    text: `${['Api', 'Key'].join('_')}=${letters}`,
    masked: `${['Api', 'Key'].join('_')}=[MASKED:api-key]`,
    secrets: [letters],
  },
  {
    name: 'an api key setting written as "X-API-KEY:"',
    kind: 'api-key',
    text: `${['X', 'API', 'KEY'].join('-')}: ${letters}`,
    masked: `${['X', 'API', 'KEY'].join('-')}: [MASKED:api-key]`,
    secrets: [letters],
  },
];
