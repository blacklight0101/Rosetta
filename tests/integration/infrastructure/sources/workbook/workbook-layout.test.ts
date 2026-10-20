import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  numberCell,
  readBuilt,
  row,
  sharedCell,
  stylesXml,
  worksheet,
  type WorkbookSpec,
} from '../../../../support/workbook-fixtures.js';

// RF-151: the reader finds the workbook part through `_rels/.rels`, and the shared strings, styles
// and connections through the workbook's relationships. A target outside the package is refused.

const root = useWritableTempRoot('rosetta-workbook-layout-');

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function codeOf(spec: WorkbookSpec): Promise<string | undefined> {
  try {
    await readBuilt(root.path, await buildWorkbook(spec));
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : String(error);
  }
}

const SHEET = { name: 'S', xml: worksheet(row(1, numberCell('B1', 45000, 0))) };
const TEXT_SHEET = {
  name: 'S',
  xml: worksheet(row(1, sharedCell('A1', 0) + numberCell('B1', 45000, 0))),
};

it('RF-151 reads a package whose workbook part is xl/book.xml named by _rels/.rels', async () => {
  const bytes = await buildWorkbook({ sheets: [SHEET], workbookPart: 'xl/book.xml' });

  await expect(readBuilt(root.path, bytes)).resolves.toMatchObject({ sheets: [{ name: 'S' }] });
});

it('RF-151 reads a workbook part in another folder, with its sheets relative to it', async () => {
  const bytes = await buildWorkbook({ sheets: [SHEET], workbookPart: 'xl/main/book.xml' });

  await expect(readBuilt(root.path, bytes)).resolves.toMatchObject({ sheets: [{ name: 'S' }] });
});

it('RF-151 reads xl/workbook.xml when the package has no _rels/.rels', async () => {
  const bytes = await buildWorkbook({ sheets: [SHEET], omitRootRels: true });

  await expect(readBuilt(root.path, bytes)).resolves.toMatchObject({ sheets: [{ name: 'S' }] });
});

it('RF-151 finds shared strings, styles and connections through the workbook relationships', async () => {
  const bytes = await buildWorkbook({
    sheets: [TEXT_SHEET],
    workbookRels: [
      `<Relationship Id="rId40" Type="${REL}/sharedStrings" Target="data/text.xml"/>`,
      `<Relationship Id="rId41" Type="${REL}/styles" Target="/xl/look/format.xml"/>`,
      `<Relationship Id="rId42" Type="${REL}/connections" Target="links/conn.xml"/>`,
    ].join(''),
    extraParts: [
      { name: 'xl/data/text.xml', data: `<sst xmlns="${MAIN_NS}"><si><t>Hello</t></si></sst>` },
      { name: 'xl/look/format.xml', data: stylesXml([14]) },
      {
        name: 'xl/links/conn.xml',
        data: `<connections xmlns="${MAIN_NS}"><connection id="1" name="Sales" type="5"/></connections>`,
      },
    ],
  });

  const model = await readBuilt(root.path, bytes);

  const cells = model.sheets[0]?.cells ?? [];
  expect(cells[0]?.value).toEqual({ type: 'text', value: 'Hello' });
  expect(cells[1]?.numberFormat).toBe('mm-dd-yy');
  expect(model.connections).toEqual([{ name: 'Sales', sourceType: 5 }]);
});

it('RF-151 does not read a part at the usual path when the relationship names another', async () => {
  const bytes = await buildWorkbook({
    sheets: [SHEET],
    workbookRels: `<Relationship Id="rId40" Type="${REL}/connections" Target="links/conn.xml"/>`,
    extraParts: [
      {
        name: 'xl/connections.xml',
        data: `<connections xmlns="${MAIN_NS}"><connection id="1" name="Stale" type="5"/></connections>`,
      },
      {
        name: 'xl/links/conn.xml',
        data: `<connections xmlns="${MAIN_NS}"><connection id="2" name="Real" type="5"/></connections>`,
      },
    ],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.connections).toEqual([{ name: 'Real', sourceType: 5 }]);
});

it('RF-151 refuses a root relationship that points outside the package with RST-1927', async () => {
  expect(await codeOf({ sheets: [SHEET], rootTarget: '../../etc/passwd' })).toBe('RST-1927');
  expect(await codeOf({ sheets: [SHEET], rootTarget: '/../etc/passwd' })).toBe('RST-1927');
});

it('RF-151 says that the relationship points outside the package', async () => {
  const bytes = await buildWorkbook({ sheets: [SHEET], rootTarget: '../../etc/passwd' });

  await expect(readBuilt(root.path, bytes)).rejects.toThrow(/outside the package/);
});

it.each(['sharedStrings', 'styles', 'connections'])(
  'RF-151 refuses a %s relationship that points outside the package with RST-1927',
  async (type) => {
    const spec = {
      sheets: [SHEET],
      workbookRels: `<Relationship Id="rId40" Type="${REL}/${type}" Target="../../etc/passwd"/>`,
    };

    expect(await codeOf(spec)).toBe('RST-1927');
  },
);

it('RF-151 refuses a sheet relationship that points outside the package with RST-1927', async () => {
  const rels = `<Relationship Id="rId9" Type="${REL}/comments" Target="../../../x.xml"/>`;

  expect(await codeOf({ sheets: [{ name: 'S', rels }] })).toBe('RST-1927');
});
