import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007: the plain message and the next step of the codes from RST-2000 on (web and HTTP,
// observability, accounts, keys, database, deployment), in numeric order. descriptions.ts merges
// them with the rest; describeError there is the only way to read them.

export type ServerErrorCode = Extract<ErrorCode, `RST-2${string}`>;

export const SERVER_ERROR_DESCRIPTIONS: Readonly<Record<ServerErrorCode, ErrorDescription>> = {
  'RST-2000': {
    message: 'The request is not valid.',
    nextStep: 'Check the values you sent and try again.',
  },
  'RST-2001': {
    message: 'You are not signed in.',
    nextStep: 'Sign in and try again.',
  },
  'RST-2002': {
    message: 'You are not allowed to do this.',
    nextStep: 'Ask an administrator if you need access.',
  },
  'RST-2003': {
    message: 'The page or item was not found.',
    nextStep: 'Check the address, or go back to your projects.',
  },
  'RST-2004': {
    message: 'The request conflicts with the current state.',
    nextStep: 'Reload the page to see the latest state, then try again.',
  },
  'RST-2005': {
    message: 'Too many requests.',
    nextStep: 'Wait a minute and try again.',
  },
  'RST-2006': {
    message: 'Something unexpected went wrong.',
    nextStep: 'Try again; if it keeps failing, ask the operator to check the application log.',
  },
  'RST-2007': {
    message: 'The request did not come from a Rosetta page, so it was refused.',
    nextStep: 'Open Rosetta at its own address and try again from there.',
  },
  'RST-2008': {
    message: 'The security token of the request is missing or no longer valid.',
    nextStep: 'Reload the page and try again.',
  },
  'RST-2101': {
    message: 'Secret masking failed, so the content was withheld.',
    nextStep: 'Nothing was sent or logged unmasked; check the application log and try again.',
  },
  'RST-2102': {
    message: 'The application log folder could not be written.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2103': {
    message: 'The provider call log or a transcript could not be written.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2104': {
    message: 'The events of a run could not be stored or read.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2105': {
    message: 'A run event was refused because it does not follow the run log.',
    nextStep: 'The run keeps its stored events; report this if it happens again.',
  },
  'RST-2106': {
    message: 'The manifest of a run could not be stored or read.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2201': {
    message: 'User name or password is incorrect.',
    nextStep: 'Check both and try again.',
  },
  'RST-2202': {
    message: 'The password must have at least 12 characters.',
    nextStep: 'Choose a longer password, for example a phrase of several words.',
  },
  'RST-2203': {
    message: 'The password is on the list of the most common passwords.',
    nextStep: 'Choose a password that is harder to guess.',
  },
  'RST-2204': {
    message: 'The password must not contain the user name.',
    nextStep: 'Choose a password that does not include the user name.',
  },
  'RST-2205': {
    message: 'An account with this user name already exists.',
    nextStep: 'Choose another user name.',
  },
  'RST-2206': {
    message:
      'The user name must have 3 to 40 characters: letters a-z, digits, dot, dash or underscore.',
    nextStep: 'Choose a user name that uses only those characters.',
  },
  'RST-2207': {
    message: 'The display name must have 1 to 80 characters.',
    nextStep: 'Enter a shorter name, or one that is not empty.',
  },
  'RST-2208': {
    message: 'This change is not possible in the current state of the account.',
    nextStep: 'Reload the administration page to see the account state, then try again.',
  },
  'RST-2209': {
    message: 'A stored password hash could not be read.',
    nextStep: 'Ask an administrator to reset the password of the account.',
  },
  'RST-2210': {
    message: 'The account is locked for 15 minutes after five failed sign-ins.',
    nextStep: 'Wait 15 minutes, or ask an administrator to check the audit trail.',
  },
  'RST-2211': {
    message: 'The current password is not correct.',
    nextStep: 'Enter the password you signed in with, then choose the new one.',
  },
  'RST-2212': {
    message: 'You must change your password before you continue.',
    nextStep: 'Open the change-password page and choose a new password.',
  },
  'RST-2213': {
    message: 'An administrator cannot disable or reset their own account.',
    nextStep: 'Change your own password in your settings, or ask another administrator.',
  },
  'RST-2214': {
    message: 'The new password must differ from the current one.',
    nextStep: 'Choose a password you have not used for this account.',
  },
  'RST-2304': {
    message: 'The URL must use https and a public address.',
    nextStep: 'Enter an https address that is reachable from the internet.',
  },
  'RST-2305': {
    message: 'This server cannot run that stage yet.',
    nextStep: 'Start a stage that is available, or ask the operator to update Rosetta.',
  },
  'RST-2400': {
    message: 'A database migration file has an invalid name or a duplicate number.',
    nextStep: 'Name each file NNNN_snake_name.sql with a number used once, then start again.',
  },
  'RST-2401': {
    message: 'A database migration that was already applied has been changed.',
    nextStep: 'Restore the original file and put the change in a new numbered migration.',
  },
  'RST-2402': {
    message: 'The database has a migration that this version of Rosetta does not know.',
    nextStep: 'Run the Rosetta version that applied it, or restore the database from a backup.',
  },
  'RST-2403': {
    message: 'A database migration failed; the previous schema was kept.',
    nextStep: 'Read the cause in the log, fix the migration and start again.',
  },
  'RST-2404': {
    message: 'The database could not complete the request.',
    nextStep: 'Check that PostgreSQL is running and reachable, then try again.',
  },
  'RST-2500': {
    message: 'The Rosetta version could not be read from package.json.',
    nextStep: 'Rebuild or reinstall Rosetta so that package.json ships next to the server.',
  },
  'RST-2501': {
    message: 'The list of common passwords could not be read.',
    nextStep: 'Reinstall Rosetta so that src/infrastructure/security/common-passwords.txt ships.',
  },
};
