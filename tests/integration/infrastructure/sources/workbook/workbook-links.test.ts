import { expect, it } from 'vitest';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import { buildWorkbook, readBuilt } from '../../../../support/workbook-fixtures.js';

// RF-151, RF-153, Q-38: an external link is kept by its file name only. The query and the fragment
// are cut at any depth of percent-encoding, and a target with no file name is dropped and counted.

const root = useWritableTempRoot('rosetta-workbook-links-');

const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SECRET = ['SEC', 'RET'].join('');

async function modelOf(targets: readonly string[]) {
  const rels = targets
    .map(
      (target, n) =>
        `<Relationship Id="rId${String(n + 1)}" Type="${REL_TYPE}/externalLinkPath" Target="${target}" TargetMode="External"/>`,
    )
    .join('');
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S' }],
    workbookExtra: '<externalReferences><externalReference r:id="rId50"/></externalReferences>',
    workbookRels: `<Relationship Id="rId50" Type="${REL_TYPE}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
    extraParts: [
      { name: 'xl/externalLinks/externalLink1.xml', data: '<externalLink/>' },
      {
        name: 'xl/externalLinks/_rels/externalLink1.xml.rels',
        data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
      },
    ],
  });
  return readBuilt(root.path, bytes);
}

function encodedTimes(text: string, times: number): string {
  let encoded = text;
  for (let n = 0; n < times; n += 1) encoded = encodeURIComponent(encoded);
  return encoded;
}

it('RF-153 cuts a query written as %253F, %25253F or a fragment as %2523', async () => {
  const model = await modelOf([
    `Book.xlsx%253Ftoken=${SECRET}`,
    `Twice.xlsx%25253Ftoken=${SECRET}`,
    `Frag.xlsx%2523part=${SECRET}`,
    `Lower.xlsx%253ftoken=${SECRET}`,
  ]);

  expect(model.externalLinks.map((link) => link.fileName)).toEqual([
    'Book.xlsx',
    'Twice.xlsx',
    'Frag.xlsx',
    'Lower.xlsx',
  ]);
  expect(JSON.stringify(model)).not.toContain(SECRET);
});

it('RF-153 cuts a query at any depth of encoding', async () => {
  const targets = [3, 8, 20].map((depth) =>
    encodedTimes(`Deep${String(depth)}.xlsx?token=${SECRET}`, depth),
  );

  const model = await modelOf(targets);

  expect(model.externalLinks.map((link) => link.fileName)).toEqual([
    'Deep3.xlsx',
    'Deep8.xlsx',
    'Deep20.xlsx',
  ]);
  expect(JSON.stringify(model)).not.toContain(SECRET);
});

it('RF-153 hides a folder written with an encoded separator at any depth', async () => {
  const folder = ['Jo', 'hn'].join('');

  const model = await modelOf([
    `${folder}%255CBook.xlsx`,
    `${folder}%25252FOther.xlsx`,
    `${folder}%5CThird.xlsx`,
  ]);

  expect(model.externalLinks.map((link) => link.fileName)).toEqual([
    'Book.xlsx',
    'Other.xlsx',
    'Third.xlsx',
  ]);
});

it('RF-153 keeps an ordinary encoded name decoded once', async () => {
  const model = await modelOf(['file:///C:/shared/My%20Prices.xlsx']);

  expect(model.externalLinks).toEqual([{ fileName: 'My Prices.xlsx' }]);
});

it('RF-153 drops a target that holds only a query, a fragment or a host, and counts it', async () => {
  const model = await modelOf([
    '?a=b',
    `#${SECRET}`,
    `https://user:${SECRET}@host.example.test`,
    `https://user:${SECRET}@host.example.test/`,
    '%3Fa=b',
    'Kept.xlsx',
  ]);

  expect(model.externalLinks.map((link) => link.fileName)).toEqual(['Kept.xlsx']);
  expect(model.unnamedExternalLinks).toBe(5);
  expect(JSON.stringify(model)).not.toContain(SECRET);
});

it('RF-153 keeps the link number of a named link that follows a dropped one', async () => {
  const model = await modelOf(['?a=b', 'Second.xlsx']);

  expect(model.externalLinks).toEqual([{ fileName: 'Second.xlsx', position: 2 }]);
});

it('RF-153 leaves unnamedExternalLinks out when every link has a name', async () => {
  const model = await modelOf(['Only.xlsx']);

  expect(model.unnamedExternalLinks).toBeUndefined();
});
