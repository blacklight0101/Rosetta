// FAKE SECRETS ONLY (RNF-003). The secret shapes added by P1-62 (RF-141), built at run time from
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

const dash = '-';
const password = `Pw${fakeValue(14)}`;
const basicCredentials = Buffer.from(`app:${password}`).toString('base64');
const plainToken = fakeValue(40);
const awsSessionKeyId = ['AS', 'IA', fakeValue(16)].join('');
const openAiKey = ['sk', 'proj', fakeValue(40)].join(dash);
const stripeKey = ['sk', 'live', fakeValue(24)].join('_');
const restrictedKey = ['rk', 'test', fakeValue(24)].join('_');
const longPassword = `Long${fakeValue(600)}`;

/** One case per shape of P1-62, in the order of the card. */
export const moreSecretCases: readonly ShapeCase[] = [
  {
    name: 'basic credentials in an Authorization header',
    kind: 'bearer-token',
    text: `Authorization: Basic ${basicCredentials}`,
    masked: 'Authorization: Basic [MASKED:bearer-token]',
    secrets: [basicCredentials],
  },
  {
    name: 'basic credentials in a header object in code',
    kind: 'bearer-token',
    text: `fetch(url, { headers: { authorization: 'Basic ${basicCredentials}' } });`,
    masked: "fetch(url, { headers: { authorization: 'Basic [MASKED:bearer-token]' } });",
    secrets: [basicCredentials],
  },
  {
    name: 'a token scheme in an Authorization header',
    kind: 'bearer-token',
    text: `curl -H "Authorization: token ${plainToken}" https://api.example.com/`,
    masked: 'curl -H "Authorization: token [MASKED:bearer-token]" https://api.example.com/',
    secrets: [plainToken],
  },
  {
    name: 'an AWS temporary access key id (ASIA)',
    kind: 'api-key',
    text: `aws_access_key_id=${awsSessionKeyId}`,
    masked: 'aws_access_key_id=[MASKED:api-key]',
    secrets: [awsSessionKeyId],
  },
  {
    name: 'an XML password element',
    kind: 'password',
    text: `<database>\n  <password>${password}</password>\n</database>`,
    masked: '<database>\n  <password>[MASKED:password]</password>\n</database>',
    secrets: [password],
  },
  {
    name: 'an XML password element whose end tag is on the same line',
    kind: 'password',
    text: `<config><password>${password}</password><user>app</user></config>`,
    masked: '<config><password>[MASKED:password]</password><user>app</user></config>',
    secrets: [password],
  },
  {
    name: 'an XML password element with a prefix and an attribute',
    kind: 'password',
    text: `<db:SmtpPassword encrypted="false">${password} with spaces</db:SmtpPassword>`,
    masked: '<db:SmtpPassword encrypted="false">[MASKED:password]</db:SmtpPassword>',
    secrets: [password],
  },
  {
    name: 'a mysql -p password on a command line',
    kind: 'password',
    text: `mysql -h db -u root -p${password} catalog < dump.sql`,
    masked: 'mysql -h db -u root -p[MASKED:password] catalog < dump.sql',
    secrets: [password],
  },
  {
    name: 'an OpenAI key (sk-) after an underscore',
    kind: 'api-key',
    text: `key: "prod_${openAiKey}"`,
    masked: 'key: "prod_[MASKED:api-key]"',
    secrets: [openAiKey],
  },
  {
    name: 'a Stripe-style secret key (sk_live_)',
    kind: 'api-key',
    text: `api_key = "${stripeKey}"`,
    masked: 'api_key = "[MASKED:api-key]"',
    secrets: [stripeKey],
  },
  {
    name: 'a Stripe-style restricted key (rk_test_) after an underscore',
    kind: 'api-key',
    text: `STRIPE_KEY=default_${restrictedKey}`,
    masked: 'STRIPE_KEY=default_[MASKED:api-key]',
    secrets: [restrictedKey],
  },
  {
    name: 'a connection URL password longer than 512 characters',
    kind: 'connection-string',
    text: `postgres://app:${longPassword}@db:5432/catalog`,
    masked: 'postgres://app:[MASKED:connection-string]@db:5432/catalog',
    secrets: [longPassword, fakeValue(100)],
  },
];

/** Text close to the new shapes that is not a secret. */
export const moreInnocentTexts: readonly string[] = [
  'ASIA is a continent',
  'Basic usage: run the tool with a token count of 12',
  '<PasswordBox x:Name="pwd" />',
  '<input type="password" name="pwd">',
  '<password/>',
  'Usage: login <user> <password>, then `<password>` again',
  'mysql -u root -p -D catalog',
  'mysql -P 3306 -u app catalog',
  '# mysql is used in production -pretty much everywhere',
  'We moved from mysql to postgres, -people say -pgsql is faster',
  '<password>placeholder text\nthen </note> closes',
  'ask-1234567890123456789012345 finished',
  'sk_live_ is the prefix of a live key',
];

/** Hostile pieces for the new patterns (RF-141 linear time), built from pieces like the cases. */
export const moreAdversarialPieces: readonly string[] = [
  ['Authorization', ' Basic '].join(':'),
  ['authorization', '"token '].join('='),
  'Authorization: ',
  ['AS', 'IA'].join(''),
  '<password>',
  '<pwd a',
  '<a',
  '<x:',
  'mysql ',
  'mysql -p',
  ' -p',
  ['_sk', ''].join(dash),
  ['sk', 'live', ''].join('_'),
  ['x', 'rk', 'test', ''].join('_'),
  'a-b://',
];
