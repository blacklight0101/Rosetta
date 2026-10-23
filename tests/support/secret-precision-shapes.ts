// FAKE SECRETS ONLY (RNF-003). The masker precision shapes added by P2-40 (RF-141), built at run time
// from harmless pieces like those of secret-fixture.ts, which joins them to its cases, innocent
// texts and hostile pieces: Bearer placeholders and values with `,` `;` or a no-break space, an
// `api_key` setting, and the `--token=` option in prose and on a command line.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';
import { boundarySecretCases } from './secret-boundary-shapes.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

const noBreakSpace = String.fromCharCode(0xa0);
const tokenOption = ['-', '-', 'token'].join('');
const backslash = String.fromCharCode(92);
const caret = '^';
const backtick = String.fromCharCode(96);
const header = 'Authorization: Bearer';
const masked = '[MASKED:bearer-token]';
const token = `Tk${fakeValue(20)}`;
const shortToken = `Tk${fakeValue(8)}`;
const apiKeyValue = `${fakeValue(5)}:${fakeValue(5)}-${fakeValue(3)}!${fakeValue(9)}`;
const apiKeyName = ['api', 'key'].join('_');
const apiKeyPlaceholderVar = '${API_KEY}';

/** The line continuation of a shell with blanks after its mark, then the next line, indented. */
const continuedAfterBlanks = (mark: string, lineBreak: string): string =>
  `${mark} \t${lineBreak}    `;

/** One case per item of P2-40, in the order of the card. */
const precisionCases: readonly ShapeCase[] = [
  {
    name: 'a Bearer header value that holds a comma',
    kind: 'bearer-token',
    text: `${header} ${shortToken},${token}`,
    masked: `${header} ${masked}`,
    secrets: [shortToken, token],
  },
  {
    name: 'a Bearer header value that holds a semicolon',
    kind: 'bearer-token',
    text: `${header} ${shortToken};${token} next`,
    masked: `${header} ${masked} next`,
    secrets: [shortToken, token],
  },
  {
    name: 'a Bearer header value after a no-break space',
    kind: 'bearer-token',
    text: `${header}${noBreakSpace}${shortToken}`,
    masked: `${header}${noBreakSpace}${masked}`,
    secrets: [shortToken],
  },
  {
    name: 'a long Bearer value after a no-break space without a header',
    kind: 'bearer-token',
    text: `curl -H "Bearer${noBreakSpace}${token}"`,
    masked: `curl -H "Bearer${noBreakSpace}${masked}"`,
    secrets: [token],
  },
  {
    name: 'an api_key setting with a colon, a dash and an exclamation mark',
    kind: 'api-key',
    text: `${apiKeyName}=${apiKeyValue}`,
    masked: `${apiKeyName}=[MASKED:api-key]`,
    secrets: [apiKeyValue],
  },
  {
    name: 'a quoted apiKey property in JSON',
    kind: 'api-key',
    text: `{ "apiKey": "${apiKeyValue}", "debug": true }`,
    masked: '{ "apiKey": "[MASKED:api-key]", "debug": true }',
    secrets: [apiKeyValue],
  },
  {
    name: 'an x-api-key header',
    kind: 'api-key',
    text: `x-api-key: ${apiKeyValue}`,
    masked: 'x-api-key: [MASKED:api-key]',
    secrets: [apiKeyValue],
  },
  {
    name: 'a --token= value after a blank on a command line',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= ${token} --verbose`,
    masked: `tool ${tokenOption}= ${masked} --verbose`,
    secrets: [token],
  },
  {
    name: 'a --token= value after a scheme word on a command line',
    kind: 'bearer-token',
    text: `tool ${tokenOption}= Bearer ${shortToken}`,
    masked: `tool ${tokenOption}= Bearer ${masked}`,
    secrets: [shortToken],
  },
  {
    name: 'a --token= value on the line after a backslash and blanks',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=${continuedAfterBlanks(backslash, '\n')}${token}`,
    masked: `tool ${tokenOption}=${continuedAfterBlanks(backslash, '\n')}${masked}`,
    secrets: [token],
  },
  {
    name: 'a --token= value on the line after a caret and blanks with CRLF',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=${continuedAfterBlanks(caret, '\r\n')}${token}`,
    masked: `tool ${tokenOption}=${continuedAfterBlanks(caret, '\r\n')}${masked}`,
    secrets: [token],
  },
  {
    name: 'a --token= value on the line after a backtick and blanks',
    kind: 'bearer-token',
    text: `tool ${tokenOption}=${continuedAfterBlanks(backtick, '\n')}${shortToken}`,
    masked: `tool ${tokenOption}=${continuedAfterBlanks(backtick, '\n')}${masked}`,
    secrets: [shortToken],
  },
  {
    name: 'a --token value on the line after a backslash and blanks',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer ${continuedAfterBlanks(backslash, '\n')}${token}`,
    masked: `tool ${tokenOption} Bearer ${continuedAfterBlanks(backslash, '\n')}${masked}`,
    secrets: [token],
  },
  {
    name: 'a --token value on the line after a caret and blanks with CRLF',
    kind: 'bearer-token',
    text: `tool ${tokenOption} ${continuedAfterBlanks(caret, '\r\n')}${token}`,
    masked: `tool ${tokenOption} ${continuedAfterBlanks(caret, '\r\n')}${masked}`,
    secrets: [token],
  },
  {
    name: 'a --token value on the line after a backtick and blanks',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer${continuedAfterBlanks(backtick, '\n')}${shortToken}`,
    masked: `tool ${tokenOption} Bearer${continuedAfterBlanks(backtick, '\n')}${masked}`,
    secrets: [shortToken],
  },
];

/** Every case of P2-40, with the boundary cases. */
export const precisionSecretCases: readonly ShapeCase[] = [
  ...precisionCases,
  ...boundarySecretCases,
];

/** Text close to the new shapes that is not a secret: placeholders and prose. */
export const precisionInnocentTexts: readonly string[] = [
  `${header} <token>`,
  `${header} {token}`,
  `${header} \${TOKEN}`,
  `${header} $token`,
  `${header} YOUR_TOKEN`,
  `${header} [token]`,
  `${header} xxxx`,
  `${header} <your-access-token-here>`,
  `curl -H "${header} $TOKEN" https://example.com`,
  `{ "Authorization": "Bearer {token}" }`,
  `Send the ${header} header on every request.`,
  `Bearer${noBreakSpace}tokens are short lived`,
  `the ${tokenOption}= flag sets the token`,
  `Pass the ${tokenOption}= option first`,
  `${apiKeyName}=YOUR_API_KEY`,
  `${apiKeyName}=<your-api-key-here>`,
  `apiKey: process.env.OPENAI_API_KEY`,
  `${apiKeyName} = config.apiKey`,
  `${apiKeyName}=process.env.SERVICE_KEY`,
  `${apiKeyName}=${apiKeyPlaceholderVar}`,
  `${header} $API_TOKEN`,
  `${header} <access-token>`,
  `${tokenOption}= flag`,
  `the ${tokenOption}= argument is optional`,
  `${tokenOption}= value, then more`,
  `${tokenOption}= switch`,
  `${tokenOption}= is set elsewhere`,
  `${apiKeyName}=abcdefg`,
  'apiKey: string;',
  `if (${apiKeyName} == expected) { return; }`,
];

/** Hostile pieces for the new patterns (RF-141 linear time), built from pieces like the cases. */
export const precisionAdversarialPieces: readonly string[] = [
  `${header} `,
  `${header} a,`,
  `${header} a;b,`,
  `${header}${noBreakSpace}`,
  `${header} <`,
  `${header} \${`,
  `${header} xxxx`,
  `${apiKeyName}=`,
  `${apiKeyName}=a.`,
  `${apiKeyName}: "`,
  `${apiKeyName}=a_`,
  `${tokenOption}= `,
  `${tokenOption}= abc `,
  `${tokenOption}= ${backslash} \n`,
];
