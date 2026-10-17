// FAKE SECRETS ONLY (RNF-003). P2-43 (RF-141): token and secret keys, prefixed keys and flags.

import type { CoverageCase } from './secret-coverage-values.js';
import {
  token,
  secret,
  sig,
  jwt,
  google,
  slack,
  sendGrid,
  stripe,
  twilio,
  dashed,
  f,
  one,
} from './secret-coverage-values.js';

const tokenKeyCases: readonly CoverageCase[] = [
  one(
    'an access_token setting',
    'bearer-token',
    [`{"access_token":"${token}"}`, '{"access_token":"[MASKED:bearer-token]"}'],
    token,
  ),
  one(
    'an id_token setting',
    'bearer-token',
    [`id_token: ${token}`, 'id_token: [MASKED:bearer-token]'],
    token,
  ),
  one(
    'a refresh_token query value',
    'bearer-token',
    [`refresh_token=${token}&x=1`, 'refresh_token=[MASKED:bearer-token]&x=1'],
    token,
  ),
  one(
    'a bare token: key',
    'bearer-token',
    [`token: "${token}"`, 'token: "[MASKED:bearer-token]"'],
    token,
  ),
  one(
    'NPM_TOKEN',
    'bearer-token',
    [`NPM_TOKEN=${token}`, 'NPM_TOKEN=[MASKED:bearer-token]'],
    token,
  ),
  one(
    'an npmrc _authToken',
    'bearer-token',
    [
      `//registry.example.com/:_authToken=${token}`,
      '//registry.example.com/:_authToken=[MASKED:bearer-token]',
    ],
    token,
  ),
];

const secretKeyCases: readonly CoverageCase[] = [
  one(
    'a client_secret setting',
    'password',
    [`client_secret=${secret}`, 'client_secret=[MASKED:password]'],
    secret,
  ),
  one(
    'SECRET_KEY',
    'password',
    [`SECRET_KEY = '${secret}'`, "SECRET_KEY = '[MASKED:password]'"],
    secret,
  ),
  one(
    'a "secret": property',
    'password',
    [`{ "secret": "${secret}" }`, '{ "secret": "[MASKED:password]" }'],
    secret,
  ),
  one(
    'aws_secret_access_key',
    'password',
    [`aws_secret_access_key = ${f(40)}`, 'aws_secret_access_key = [MASKED:password]'],
    f(40),
  ),
  one(
    'an Azure AccountKey',
    'password',
    [
      `AccountName=app;AccountKey=${f(60)}==;Suffix=x`,
      'AccountName=app;AccountKey=[MASKED:password];Suffix=x',
    ],
    f(60),
  ),
];

const prefixCases: readonly CoverageCase[] = [
  one(
    'a bare JWT in a log line',
    'bearer-token',
    [`user in ${jwt} ok`, 'user in [MASKED:bearer-token] ok'],
    jwt,
  ),
  one(
    'an Azure SAS sig',
    'api-key',
    [
      `https://a.blob.example/c?sv=1&sig=${sig}&se=2`,
      'https://a.blob.example/c?sv=1&sig=[MASKED:api-key]&se=2',
    ],
    sig,
  ),
  one(
    'a Google API key',
    'api-key',
    [`https://x.example/v1?key=${google}`, 'https://x.example/v1?key=[MASKED:api-key]'],
    google,
  ),
  one(
    'a Slack token',
    'api-key',
    [`slack.post("${slack}")`, 'slack.post("[MASKED:api-key]")'],
    slack,
  ),
  one(
    'a SendGrid key',
    'api-key',
    [`new Client('${sendGrid}')`, "new Client('[MASKED:api-key]')"],
    sendGrid,
  ),
  one(
    'a Stripe webhook secret',
    'api-key',
    [`listen prints ${stripe} now`, 'listen prints [MASKED:api-key] now'],
    stripe,
  ),
  one(
    'a Twilio API key SID',
    'api-key',
    [`twilio key ${twilio} made`, 'twilio key [MASKED:api-key] made'],
    twilio,
  ),
  one(
    'a SharedAccessSignature setting',
    'api-key',
    [
      `Blob=https://a.example/;SharedAccessSignature=sv=1&ss=b&sig=${sig}`,
      'Blob=https://a.example/;SharedAccessSignature=[MASKED:api-key]',
    ],
    sig,
  ),
  one(
    'a SharedAccessSignature header',
    'api-key',
    [
      `Authorization: SharedAccessSignature sr=x&sig=${sig}&se=1`,
      'Authorization: SharedAccessSignature [MASKED:api-key]',
    ],
    sig,
  ),
];

const flagCases: readonly CoverageCase[] = [
  one(
    'the api-key flag',
    'api-key',
    [
      `deploy ${dashed('api-key')} ${token} now`,
      `deploy ${dashed('api-key')} [MASKED:api-key] now`,
    ],
    token,
  ),
  one(
    'the apikey flag with =',
    'api-key',
    [`deploy ${dashed('apikey')}=${token} now`, `deploy ${dashed('apikey')}=[MASKED:api-key] now`],
    token,
  ),
  one(
    'the auth-token flag',
    'bearer-token',
    [
      `login ${dashed('auth-token')} ${token} now`,
      `login ${dashed('auth-token')} [MASKED:bearer-token] now`,
    ],
    token,
  ),
  one(
    'the access-token flag with =',
    'bearer-token',
    [
      `login ${dashed('access-token')}=${token} now`,
      `login ${dashed('access-token')}=[MASKED:bearer-token] now`,
    ],
    token,
  ),
  one(
    'the secret flag',
    'password',
    [`sign ${dashed('secret')} ${secret} now`, `sign ${dashed('secret')} [MASKED:password] now`],
    secret,
  ),
  one(
    'the client-secret flag with =',
    'password',
    [
      `sign ${dashed('client-secret')}=${secret} now`,
      `sign ${dashed('client-secret')}=[MASKED:password] now`,
    ],
    secret,
  ),
];

export const keyCoverageCases: readonly CoverageCase[] = [
  ...tokenKeyCases,
  ...secretKeyCases,
  ...prefixCases,
  ...flagCases,
];
