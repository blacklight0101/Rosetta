// FAKE SECRETS ONLY (RNF-003). The key/value shapes of the follow-up of P3-116 (RF-141): spaces around
// `=` and mixed-case attribute names, element forms for token, secret and API key names, short values
// under explicit key names, values that are never secrets (booleans and numbers), and values glued to a
// raw `<`. Built at run time from harmless pieces; secret-gap-shapes.ts joins them to the shared lists.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

const one = (
  name: string,
  kind: SecretKind,
  [text, masked]: readonly [string, string],
  secret: string,
): ShapeCase => ({ name, kind, text, masked, secrets: [secret] });

const pw = `Pw${fakeValue(10)}1`;
const tk = `Tk${fakeValue(10)}2`;
const shortTk = 'k9x2';
const shortPw = 'Pw12345';
const pwMask = '[MASKED:password]';
const tkMask = '[MASKED:bearer-token]';

/** One case per shape of the follow-up. */
export const variantSecretCases: readonly ShapeCase[] = [
  one(
    'an appSettings password with spaces around the equals signs',
    'password',
    [
      `<add key = "SmtpPassword" value = "${pw}"/>`,
      `<add key = "SmtpPassword" value = "${pwMask}"/>`,
    ],
    pw,
  ),
  one(
    'an appSettings password with no space between the attributes',
    'password',
    [`<add key="SmtpPassword"value="${pw}"/>`, `<add key="SmtpPassword"value="${pwMask}"/>`],
    pw,
  ),
  one(
    'an appSettings password with upper-case attribute names',
    'password',
    [`<ADD KEY="SmtpPassword" VALUE="${pw}"/>`, `<ADD KEY="SmtpPassword" VALUE="${pwMask}"/>`],
    pw,
  ),
  one(
    'a setting with a mixed-case name attribute and the value first',
    'password',
    [
      `<add Value = '${pw}' Name = 'SmtpPassword'/>`,
      `<add Value = '${pwMask}' Name = 'SmtpPassword'/>`,
    ],
    pw,
  ),
  one(
    'an element named after a token',
    'bearer-token',
    [`<ApiToken>${tk}</ApiToken>`, `<ApiToken>${tkMask}</ApiToken>`],
    tk,
  ),
  one(
    'an element named after a client secret',
    'password',
    [`<ClientSecret>${pw}</ClientSecret>`, `<ClientSecret>${pwMask}</ClientSecret>`],
    pw,
  ),
  one(
    'an element named after an API key, with an attribute',
    'api-key',
    [
      `<Vendor.ApiKey type="text">${tk}</Vendor.ApiKey>`,
      '<Vendor.ApiKey type="text">[MASKED:api-key]</Vendor.ApiKey>',
    ],
    tk,
  ),
  one(
    'a short token under an explicit .env name',
    'bearer-token',
    [`api_token=${shortTk}\nPORT=25`, `api_token=${tkMask}\nPORT=25`],
    shortTk,
  ),
  one(
    'a short secret under an explicit INI name',
    'password',
    [`[app]\nAppSecret=${shortTk}\nport=25`, `[app]\nAppSecret=${pwMask}\nport=25`],
    shortTk,
  ),
  one(
    'a short secret with spaces around the equals sign',
    'password',
    [`ClientSecret = ${shortPw}\nport = 25`, `ClientSecret = ${pwMask}\nport = 25`],
    shortPw,
  ),
  one(
    'a short token in JSON',
    'bearer-token',
    [`{"apiToken":"${shortTk}","port":25}`, `{"apiToken":"${tkMask}","port":25}`],
    shortTk,
  ),
  one(
    'a short secret in YAML',
    'password',
    [
      `auth:\n  client_secret: ${shortTk}\n  port: 25`,
      `auth:\n  client_secret: ${pwMask}\n  port: 25`,
    ],
    shortTk,
  ),
  one(
    'a pass value glued to a raw tag',
    'password',
    [`pass=${pw}<br/>`, `pass=${pwMask}<br/>`],
    pw,
  ),
  one(
    'a token value glued to a raw tag',
    'bearer-token',
    [`<p>token=${pw}</p>`, `<p>token=${tkMask}</p>`],
    pw,
  ),
  one(
    'a secret value glued to a raw tag',
    'password',
    [`<li>secret: ${pw}</li>`, `<li>secret: ${pwMask}</li>`],
    pw,
  ),
];

/** Settings whose value is a boolean or a number, or whose key is only a bare word: left alone. */
export const variantInnocentTexts: readonly string[] = [
  '<add key="EnableToken" value="true"/>',
  '<add key="UseSecret" value="False"/>',
  '<add key="TokenLifetime" value="30"/>',
  '<add key="MaxToken" value="30"/>',
  '<add key="AppSecret" value="42"/>',
  '<add key = "EnableToken" value = "yes"/>',
  '<ApiToken>true</ApiToken>',
  '<ClientSecret>12345678</ClientSecret>',
  '<ApiToken></ApiToken>',
  'UseSecret=false',
  'EnableToken: true',
  'api_token=30',
  'api_token=123456789',
  'apiToken: string',
  'client_secret: str',
  'token=ab12',
  'secret: s3',
  'Token = xy9',
];

/** Shapes that make a backtracking pattern scan the rest of the input from every position. */
export const variantAdversarialPieces: readonly string[] = [
  '<ApiToken>',
  '<ApiToken>a',
  '<A.Secret ',
  '<A.Secret x="',
  'key = ',
  'KEY = "',
  '<add key = "SmtpPassword" value = "',
  '<add key = "SmtpPassword" ',
  'api_token=',
  'apiToken":"',
  'pass=a<',
  'token=a<b ',
  'client_secret: a<',
];
