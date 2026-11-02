import { describe, expect, it } from 'vitest';
import { nameAnsweredByCitedLines } from '../../../../src/domain/cards/open-question-answered.js';

// RF-243, P8-08 (EV-09): a question for the connection string, the publish parameters or the source
// of a macro is answered when the cited lines hold it. Each negative case is one guard that keeps a
// genuine question. Synthetic names only.

const config = '<add name="Shop" connectionString="Server=localhost;Database=Shop;Trusted=true" />';
const publish = 'msbuild Shop.sln /p:DeployOnBuild=true /p:PublishProfile=Release';
const macro =
  'Attribute VB_Name = "modInvoice"\nPublic Sub InvoiceTotal()\n  Range("D2") = 1\nEnd Sub';

describe('P8-08 questions the cited lines answer by kind', () => {
  it.each([
    ['What is the connection string of the shop database?', config, 'connection string'],
    ['Which connection string does the Shop app use?', config, 'connection string'],
    ['What are the publish parameters of the web app?', publish, 'publish parameters'],
    ['What parameters are used to publish the web app?', publish, 'publish parameters'],
    ['Where is the VBA source of the invoice macro?', macro, 'InvoiceTotal'],
  ])('RF-243 drops "%s" and names what the lines define', (question, cited, name) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBe(name);
  });

  it.each([
    ['What is the connection string of the shop database?', 'var x = 1;'],
    ['What is the connection string of the shop database?', '// TODO connectionString = ?'],
    ['What connection string does the Shop app use in production?', config],
    ['What is the connection string password policy?', config],
    ['Why is the connection string set here?', config],
    ['What are the publish parameters of the web app?', 'var x = 1;'],
    ['Who approves the publish parameters of the web app?', publish],
    ['Where is the VBA source of the invoice macro?', 'Range("D2") = 1'],
    ['Should the VBA source of the invoice macro be kept?', macro],
    ['Why does the VBA source of the invoice macro round up?', macro],
    // P8-08 verifier round: the lines hold something else than the answer to this question
    ['What is the connection string of the staging database?', config],
    ['What is the connection string of the backup database?', config],
    [
      'What is the connection string of the shop database?',
      'connectionString = Config.Get("Shop")',
    ],
    [
      'What is the connection string of the shop database?',
      `${config}
${config}`,
    ],
    ['What are the publish parameters for the customer server?', 'dotnet publish -c Release'],
    ['What are the publish parameters of the web app?', 'dotnet publish -c Release'],
    ['Where is the VBA source of the import module?', macro],
    ['Is the VBA source of the invoice workbook included in the upload?', macro],
    ['Where is the VBA source?', macro],
  ])('RF-243 keeps "%s" when the lines do not answer it', (question, cited) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBeUndefined();
  });
});
