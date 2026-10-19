import CFB from 'cfb';

// P3-44: compound files (the container of an old .xls and of a password-protected workbook) are
// built in the test with `cfb`, from streams of made-up bytes; nothing is committed.

/** The bytes of a compound file holding one stream per name, each with a few made-up bytes. */
export function buildCompoundFile(streamNames: readonly string[]): Buffer {
  const container = CFB.utils.cfb_new();
  for (const name of streamNames) {
    CFB.utils.cfb_add(container, `/${name}`, Buffer.from('made-up stream content'));
  }
  const written: unknown = CFB.write(container, { type: 'buffer' });
  if (!Buffer.isBuffer(written)) throw new Error('cfb did not return a buffer');
  return written;
}
