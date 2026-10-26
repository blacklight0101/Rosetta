import type { Claim } from '../../src/domain/cards/card.js';

// P5-34: a synthetic configuration whose connection string holds a plain-text password, and the
// claims a reader and a verifier meet about it. The value is fake and appears nowhere in an output.

/** A fake value; no real system uses it. */
export const fakePassword = 'Fake-Pw-7731';

export const configPath = 'School/App.config';

export const configText = [
  '<configuration>',
  '  <connectionStrings>',
  `    <add name="School" connectionString="Server=DB01;Database=School;User Id=sa;Password=${fakePassword};" />`,
  '  </connectionStrings>',
  '</configuration>',
].join('\n');

/** The line of the connection string. */
export const configLine = 3;

type ClaimParts = Pick<Claim, 'claimId' | 'text' | 'citations'>;

const cited = [{ path: configPath, startLine: configLine, endLine: configLine }];

/** The claim the reader prompt asks for. */
export const plainTextClaim: ClaimParts = {
  claimId: 'INT-001.c1',
  text: `A plain-text password is written in ${configPath}:${String(configLine)}.`,
  citations: cited,
};

/** The claim of the benchmark card INT-001: it says the value is masked in the source. */
export const maskedInSourceClaim: ClaimParts = {
  claimId: 'INT-001.c2',
  text: 'The connection string names the server DB01 and the login sa. The password is masked in the source.',
  citations: cited,
};
