import { describe, expect, it } from 'vitest';
import {
  suggestionFromCitedLines,
  type CitedLine,
} from '../../../../src/domain/cards/open-question-answered-kinds.js';

// RF-243, P8-08 (EV-09): a question for the connection string, the publish parameters or the source
// of a macro is never dropped; a cited line that holds a plain literal for it becomes a suggested
// answer with its file and line. A built value, a placeholder or a line that answers another
// question gets none. Synthetic names only.

function lines(path: string, ...texts: string[]): CitedLine[] {
  return texts.map((text, index) => ({ path, line: index + 6, text }));
}

const config = '<add name="Shop" connectionString="Server=localhost;Database=Shop;Trusted=true" />';
const publish = '<PublishProfile>Release</PublishProfile> PublishProfile=Release';
const macro = ['Attribute VB_Name = "modInvoice"', 'Public Sub InvoiceTotal()', 'End Sub'];

describe('P8-08 the line that holds a plain literal becomes a suggestion', () => {
  it.each([
    ['What is the connection string of the shop database?', lines('Web.config', config), 6],
    ['Which connection string does the Shop app use?', lines('Web.config', config), 6],
    ['What are the publish parameters of the web app?', lines('Shop.pubxml', publish), 6],
    ['Where is the VBA source of the invoice macro?', lines('Invoice.bas', ...macro), 7],
  ])('RF-243 suggests the line for "%s"', (question, cited, line) => {
    const found = suggestionFromCitedLines(question, cited);

    expect(found?.line).toBe(line);
    expect(found?.path).toBe(cited[0]?.path);
    expect(found?.description).toContain(`${cited[0]?.path ?? ''}:${String(line)}`);
  });

  it('RF-243 offers the literal itself as the answer', () => {
    const found = suggestionFromCitedLines(
      'What is the connection string of the shop database?',
      lines('Web.config', config),
    );

    expect(found?.answer).toBe('Server=localhost;Database=Shop;Trusted=true');
  });
});

describe('P8-08 the question stays open and gets no suggestion', () => {
  const ask = 'What is the connection string of the shop database?';
  it.each([
    ['a value built with &', 'connectionString = "Server=" & Range("B1").Value'],
    ['a value built with +', 'connectionString = "Server=" + host + ";Database=Shop"'],
    ['a placeholder server', 'connectionString = "Server=YOUR_SERVER;Database=Shop"'],
    ['a placeholder secret', 'connectionString = "Server=db;Database=Shop;Password=<password>"'],
    ['an environment value', 'connectionString = "Server=" & Env("X")'],
    ['a call', 'connectionString = Config.Get("Shop")'],
    ['a secret in the value', 'connectionString = "Server=db;Database=Shop;Pwd=abc"'],
  ])('RF-243 gives %s no suggestion', (_name, text) => {
    expect(suggestionFromCitedLines(ask, lines('a.vb', text))).toBeUndefined();
  });

  it('RF-243 gives two connection strings no suggestion', () => {
    expect(suggestionFromCitedLines(ask, lines('Web.config', config, config))).toBeUndefined();
  });

  it.each([
    ['What are the publish parameters of the web app?', 'PublishProfile=$(Profile)'],
    ['What are the publish parameters of the web app?', 'PublishProfile=%1'],
    ['What are the publish parameters of the web app?', '/p:DeployOnBuild=true'],
    ['What are the publish parameters of the web app?', 'dotnet publish -c Release'],
    ['What are the publish parameters of the web app?', 'var x = 1;'],
    ['Where is the VBA source of the import module?', macro[1] ?? ''],
    ['Is the VBA source of the invoice workbook in the upload?', 'Range("D2") = 1'],
    ['What is the connection string password policy?', config],
    ['Why is the connection string set here?', config],
    ['Who approves the publish parameters of the web app?', publish],
    ['Should the VBA source of the invoice macro be kept?', macro[1] ?? ''],
  ])('RF-243 gives "%s" over %j no suggestion', (question, text) => {
    expect(suggestionFromCitedLines(question, lines('a.txt', text))).toBeUndefined();
  });

  it('RF-243 gives a TODO line or a line with a question mark no suggestion', () => {
    expect(
      suggestionFromCitedLines(ask, lines('a.config', `// TODO ${config}`, `${config} ?`)),
    ).toBeUndefined();
  });
});
