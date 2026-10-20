import CFB from 'cfb';
import { expect, it, vi } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { DEFAULT_MACRO_LIMITS } from '../../../../../src/infrastructure/sources/workbook/macro-limits.js';
import { readMacroProject } from '../../../../../src/infrastructure/sources/workbook/macro-reader.js';
import {
  buildCompound,
  directorySectors,
  type EntrySpec,
} from '../../../../support/hand-made-compound.js';
import { buildVbaProject } from '../../../../support/vba-project.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import { readBuilt } from '../../../../support/workbook-fixtures.js';

// RF-151, RF-154: the compound-file guard also stands in front of the code that names an encrypted or
// legacy workbook, and the macro reader looks its streams up once, not once per module.

const root = useWritableTempRoot('rosetta-compound-safety-');

it('RF-151 refuses a hostile compound file renamed .xlsx with RST-1927, without handing it to cfb', async () => {
  const entries: EntrySpec[] = Array.from({ length: 16_000 }, (_, i) => ({
    type: i === 0 ? 5 : 1,
    child: i + 1 < 16_000 ? i + 1 : -1,
  }));
  const bytes = buildCompound({
    sectors: directorySectors(entries),
    next: (s) => (s < 3999 ? s + 1 : -2),
  });

  const read = vi.spyOn(CFB, 'read');
  const failure = await readBuilt(root.path, bytes, { fileName: 'Book.xlsx' }).catch(
    (error: unknown) => error,
  );
  const handedOver = read.mock.calls.length;
  read.mockRestore();

  expect(failure instanceof RosettaError ? failure.code : failure).toBe('RST-1927');
  expect(handedOver).toBe(0);
});

it('RF-154 finds the streams of 1,000 modules without a lookup in cfb for each', () => {
  const modules = Array.from({ length: 1000 }, (_, i) => ({
    name: `Module${String(i)}`,
    kind: 'standard' as const,
    source: `Sub M${String(i)}()\r\nEnd Sub\r\n`,
  }));
  const bytes = buildVbaProject({ modules });
  const find = vi.spyOn(CFB, 'find');

  const started = Date.now();
  const project = readMacroProject(bytes, DEFAULT_MACRO_LIMITS);
  const elapsed = Date.now() - started;
  const looked = find.mock.calls.length;
  find.mockRestore();

  expect(project.modules).toHaveLength(1000);
  expect(project.modules.every((module) => module.source.status === 'text')).toBe(true);
  expect(looked).toBe(0);
  expect(elapsed).toBeLessThan(5000);
});
