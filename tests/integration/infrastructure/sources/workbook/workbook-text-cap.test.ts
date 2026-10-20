import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../../../../../src/infrastructure/sources/workbook/workbook-limits.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  readBuilt,
  row,
  sharedCell,
  worksheet,
  type ReadOptions,
  type WorkbookSpec,
} from '../../../../support/workbook-fixtures.js';

// RF-151: one XML text value is capped, so a single huge node cannot take several times its size
// in memory. The parser holds a text node whole until the next tag, so the cap is judged while the
// node grows, not after it has been read.

const root = useWritableTempRoot('rosetta-workbook-text-');

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const SHEET = { name: 'S', xml: worksheet(row(1, sharedCell('A1', 0))) };

function sharedStringsWith(inner: string): WorkbookSpec {
  return {
    sheets: [SHEET],
    rawSharedStrings: `<sst xmlns="${MAIN_NS}"><si>${inner}</si></sst>`,
  };
}

async function failureOf(spec: WorkbookSpec, options: ReadOptions): Promise<RosettaError> {
  try {
    await readBuilt(root.path, await buildWorkbook(spec), options);
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('the workbook was read');
}

/** Random base64 does not deflate much, so the zip ratio guard does not judge the part first. */
function incompressible(chars: number): string {
  return randomBytes(Math.ceil((chars * 3) / 4))
    .toString('base64')
    .slice(0, chars);
}

const SMALL = { limits: { maxTextChars: 1000 } };

it('RF-151 refuses a text node above the cap with RST-1926', async () => {
  const failure = await failureOf(sharedStringsWith(`<t>${'a'.repeat(1001)}</t>`), SMALL);

  expect(failure.code).toBe('RST-1926');
});

it('RF-151 reads a text node of exactly the cap', async () => {
  const text = 'b'.repeat(1000);

  const model = await readBuilt(
    root.path,
    await buildWorkbook(sharedStringsWith(`<t>${text}</t>`)),
    SMALL,
  );

  expect(model.sheets[0]?.cells[0]?.value).toEqual({ type: 'text', value: text });
});

it('RF-151 refuses a node that grows across many chunks before it ends', async () => {
  const spec = sharedStringsWith(`<t>${incompressible(300_000)}</t>`);

  const failure = await failureOf(spec, { limits: { maxTextChars: 40_000 } });

  expect(failure.code).toBe('RST-1926');
});

it('RF-151 refuses a CDATA section padded with < to look like many short nodes', async () => {
  const padded = '<'.repeat(900) + 'x';
  const cdata = `<![CDATA[${Array.from({ length: 40 }, () => padded).join('')}]]>`;

  const failure = await failureOf(sharedStringsWith(`<t>${cdata}</t>`), SMALL);

  expect(failure.code).toBe('RST-1926');
});

it('RF-151 refuses an attribute value above the cap', async () => {
  const spec: WorkbookSpec = {
    sheets: [SHEET],
    workbookExtra: `<definedNames><definedName name="${'n'.repeat(2000)}">S!A1</definedName></definedNames>`,
  };

  const failure = await failureOf(spec, SMALL);

  expect(failure.code).toBe('RST-1926');
});

it('RF-151 names the limit in the message', async () => {
  const failure = await failureOf(sharedStringsWith(`<t>${'a'.repeat(2000)}</t>`), SMALL);

  expect(failure.message).toContain('1000');
});

it('RF-151 refuses a 100 MB text node and stays within a small multiple of the cap in memory', async () => {
  const spec = sharedStringsWith(`<t>${incompressible(100_000_000)}</t>`);
  const bytes = await buildWorkbook(spec);
  const base = process.memoryUsage().rss;
  let peak = base;
  const sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);

  try {
    await expect(readBuilt(root.path, bytes)).rejects.toMatchObject({ code: 'RST-1926' });
  } finally {
    clearInterval(sampler);
  }

  const cap = DEFAULT_WORKBOOK_LIMITS.maxTextChars;
  expect(cap).toBeGreaterThan(0);
  expect(peak - base).toBeLessThan(cap * 8);
}, 120_000);
