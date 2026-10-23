// FAKE SECRETS ONLY (RNF-003). The key/value settings of P3-116 (RF-141): a secret held as the value of a
// setting whose key names it (`<add key="..." value="..."/>`, `name=`/`value=`, a `<value>` element, and
// the JSON, YAML, INI and .env forms), built at run time from harmless pieces like those of
// secret-fixture.ts, which joins them to its cases, innocent texts and hostile pieces.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

/** The three values of the synthetic configuration of the card, in the order of its keys. */
export const smtpSecret = `Ex${fakeValue(6)}7`;
export const mailSecret = `Ex${fakeValue(6)}8`;
export const apiSecret = `Ex${fakeValue(6)}9`;

/** The synthetic web.config of the card: a password, a second password and a token, and a page size. */
export const syntheticAppSettings = [
  '<appSettings>',
  `  <add key="SmtpPassword" value="${smtpSecret}"/>`,
  `  <add key="MailPassword" value="${mailSecret}"/>`,
  `  <add key="ApiToken" value="${apiSecret}"/>`,
  '  <add key="PageSize" value="20"/>',
  '</appSettings>',
].join('\n');

/** The same text with the three values masked: two passwords and one token. */
export const syntheticAppSettingsMasked = syntheticAppSettings
  .replace(smtpSecret, '[MASKED:password]')
  .replace(mailSecret, '[MASKED:password]')
  .replace(apiSecret, '[MASKED:bearer-token]');

const one = (
  name: string,
  kind: SecretKind,
  [text, masked]: readonly [string, string],
  secret: string,
): ShapeCase => ({
  name,
  kind,
  text,
  masked,
  secrets: [secret],
});

const pw = `Pw${fakeValue(10)}1`;
const tk = `Tk${fakeValue(10)}2`;
const sym = `${fakeValue(8)}!x`;

/** One case per shape of P3-116. */
export const settingSecretCases: readonly ShapeCase[] = [
  one(
    'an appSettings password',
    'password',
    [
      `<add key="SmtpPassword" value="${pw}"/>`,
      '<add key="SmtpPassword" value="[MASKED:password]"/>',
    ],
    pw,
  ),
  one(
    'an appSettings token',
    'bearer-token',
    [
      `<add key="ApiToken" value="${tk}" />`,
      '<add key="ApiToken" value="[MASKED:bearer-token]" />',
    ],
    tk,
  ),
  one(
    'an appSettings API key',
    'api-key',
    [
      `<add key="Vendor.ApiKey" value="${tk}"/>`,
      '<add key="Vendor.ApiKey" value="[MASKED:api-key]"/>',
    ],
    tk,
  ),
  one(
    'an appSettings signing key with a symbol',
    'api-key',
    [`<add key="SigningKey" value="${sym}"/>`, '<add key="SigningKey" value="[MASKED:api-key]"/>'],
    sym,
  ),
  one(
    'an appSettings Pass setting',
    'password',
    [`<add key="MailPass" value="${pw}"/>`, '<add key="MailPass" value="[MASKED:password]"/>'],
    pw,
  ),
  one(
    'an appSettings secret with single quotes',
    'password',
    [
      `<add key='ClientSecret' value='${pw}'/>`,
      "<add key='ClientSecret' value='[MASKED:password]'/>",
    ],
    pw,
  ),
  one(
    'an appSettings password with a short value',
    'password',
    ['<add key="DbPassword" value="a1"/>', '<add key="DbPassword" value="[MASKED:password]"/>'],
    'a1',
  ),
  one(
    'an appSettings password whose attributes are on separate lines',
    'password',
    [
      `<add\n  key="SmtpPassword"\n  value="${pw}"\n/>`,
      '<add\n  key="SmtpPassword"\n  value="[MASKED:password]"\n/>',
    ],
    pw,
  ),
  one(
    'an appSettings password with the value attribute first',
    'password',
    [
      `<add value="${pw}" key="SmtpPassword"/>`,
      '<add value="[MASKED:password]" key="SmtpPassword"/>',
    ],
    pw,
  ),
  one(
    'a setting with a name and a value attribute',
    'password',
    [
      `<add name="SmtpPassword" value="${pw}"/>`,
      '<add name="SmtpPassword" value="[MASKED:password]"/>',
    ],
    pw,
  ),
  one(
    'a setting with another attribute between the name and the value',
    'bearer-token',
    [
      `<setting name="AuthToken" serializeAs="String" value="${tk}"/>`,
      '<setting name="AuthToken" serializeAs="String" value="[MASKED:bearer-token]"/>',
    ],
    tk,
  ),
  one(
    'an appSettings password inside a JSON string (escaped quotes)',
    'password',
    [
      `{"text":"<add key=\\"SmtpPassword\\" value=\\"${pw}\\"/>"}`,
      '{"text":"<add key=\\"SmtpPassword\\" value=\\"[MASKED:password]\\"/>"}',
    ],
    pw,
  ),
  one(
    'a user setting with a value element',
    'password',
    [
      `<setting name="SmtpPassword" serializeAs="String">\n  <value>${pw}</value>\n</setting>`,
      '<setting name="SmtpPassword" serializeAs="String">\n  <value>[MASKED:password]</value>\n</setting>',
    ],
    pw,
  ),
  one(
    'a Pass setting in an INI file',
    'password',
    [`[mail]\nsmtp_pass = ${pw}`, '[mail]\nsmtp_pass = [MASKED:password]'],
    pw,
  ),
  one(
    'a Pass variable in a .env file',
    'password',
    [`MAIL_PASS=${pw}`, 'MAIL_PASS=[MASKED:password]'],
    pw,
  ),
  one(
    'a token in YAML',
    'bearer-token',
    [
      `mail:\n  api_token: ${tk}\n  port: 25`,
      'mail:\n  api_token: [MASKED:bearer-token]\n  port: 25',
    ],
    tk,
  ),
  one(
    'a Pass property in JSON',
    'password',
    [`{"MailPass": "${pw}", "PageSize": 20}`, '{"MailPass": "[MASKED:password]", "PageSize": 20}'],
    pw,
  ),
];

/** Settings that look close to a secret but are not one; the masker leaves them unchanged. */
export const settingInnocentTexts: readonly string[] = [
  '<add key="PageSize" value="20"/>',
  '<add key="PageSize" value="20" />\n<add key="Timeout" value="30000"/>',
  '<add key="PassThrough" value="true"/>',
  '<add key="Compass" value="north-1234"/>',
  '<add key="TokenLifetime" value="36000000"/>',
  '<add key="SecretCount" value="12345678"/>',
  '<add key="CacheKey" value="items"/>',
  '<add key="PrimaryKey" value="Id"/>',
  '<add key="SortKey" value="Name,Date2"/>',
  '<add key="ApiKey" value=""/>',
  '<add key="SmtpPassword" value="[MASKED:password]"/>',
  '<add value="20" key="PageSize"/>',
  '<add name="PageSize" value="20"/>',
  '<setting name="PageSize" serializeAs="String">\n  <value>20</value>\n</setting>',
  'The pass is 20 meters long.',
  'bypass: the_old_route_2',
  'MAIL_PASSTHROUGH=enabled_1234',
];

/** Shapes that make a backtracking pattern scan the rest of the input from every position. */
export const settingAdversarialPieces: readonly string[] = [
  '<add ',
  '<add key="',
  '<add key="SmtpPassword" ',
  '<add key="SmtpPassword" value="',
  '<add value="',
  '<add value="a" key="',
  '<add name="x" ',
  '<setting name="SmtpPassword" ',
  '<setting name="SmtpPassword">\n<value>',
  '<add key=\\"',
  'key="',
  'pass=',
];
