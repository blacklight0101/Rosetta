import { describe, expect, it } from 'vitest';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../../../src/application/ports/output-writer.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { ok, type Result } from '../../../../src/domain/errors/result.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileHandoffWriter } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { fakeValue } from '../../../support/fake-value.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P7-11 (RF-141, RF-640, ADR-006, ADR-013, DEC-16, EV-59): the last mask of the package leaves the
// package's own grep patterns and the column names of the data model alone, and still masks a real
// secret in model text. FAKE values only (RNF-003).

const scope = {
  id: 'run-1',
  userId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f',
  projectId: '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70',
  runKey: '20261029-100000-plan',
};

/** A writer that keeps every file it is given. */
class KeepingWriter implements OutputWriter {
  readonly files = new Map<string, string>();

  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path.slice(file.path.indexOf('/handoff/') + '/handoff/'.length), content);
    return Promise.resolve(ok(undefined));
  }

  appendLine(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(ok(undefined));
  }

  readText(): Promise<Result<string, WriteRefusal>> {
    return Promise.resolve(ok(''));
  }

  remove(): Promise<Result<void, WriteRefusal>> {
    return Promise.resolve(ok(undefined));
  }
}

/** The package with Security by design chosen, so the secret row of the grep table is written. */
function secured(text: string, extra: Partial<HandoffPackage> = {}): HandoffPackage {
  const handoff = handoffOf(text, emptyPrd, extra);
  const principle: HandoffPackage['principles'][number] = {
    ...{ id: 'security-by-design', title: 'Security by design', rule: 'Secure.', why: 'Safe.' },
    ...{ check: 'Checked.', group: 'design-principles' },
  };
  return { ...handoff, principles: [...handoff.principles, principle] };
}

/** A column of the data model the parser dropped, named by its name (EV-59). */
const droppedColumn = (item: string): HandoffPackage['leftOut'][number] => ({
  area: 'Data model',
  item,
  field: 'table sql_data_deployment_configuration columns 9',
  reason: 'The part fails its schema, so the parser drops it; the rest of the answer is kept.',
});

async function written(handoff: HandoffPackage): Promise<ReadonlyMap<string, string>> {
  const writer = new KeepingWriter();
  await new FileHandoffWriter({ writer, masker: new SecretMasker() }).write(scope, handoff);
  return writer.files;
}

describe('FileHandoffWriter: the package keeps its own patterns and names (P7-11)', () => {
  it('RF-141 RF-640 orchestration.md keeps the `password =` pattern of the grep table and holds no mask', async () => {
    const files = await written(secured('Plain text.'));

    const orchestration = files.get('orchestration.md') ?? '';
    expect(orchestration).toContain('`password =`, `secret =`, `token =`');
    expect(orchestration).not.toContain('[MASKED:');
  });

  it('RF-141 ADR-013 a dropped data model column `sa_password` stays readable in checks.md', async () => {
    const files = await written(
      secured('Plain text.', { leftOut: [droppedColumn('sa_password')] }),
    );

    const checks = files.get('checks.md') ?? '';
    expect(checks).toContain(
      '- `sa_password`: the field "table sql_data_deployment_configuration columns 9".',
    );
    expect(checks).not.toContain('[MASKED:');
  });

  it('RF-141 DEC-16 a real secret in model text is still masked, in a dropped name and in any other text', async () => {
    const secret = `Ex${fakeValue(6)}5`;
    const files = await written(
      secured(`The setting password = \`${secret}\` is kept.`, {
        leftOut: [droppedColumn(`sa_password: ${secret}`)],
      }),
    );

    const all = [...files.values()].join('\n');
    expect(all).not.toContain(secret);
    expect(files.get('checks.md')).toContain('- `sa_password: [MASKED:password]`: the field');
    expect(files.get('orchestration.md')).toContain('`password =`, `secret =`, `token =`');
  });

  it('ADR-013 a dropped name that holds a backtick is written whole in its code span', async () => {
    const files = await written(secured('Plain text.', { leftOut: [droppedColumn('a`b')] }));

    expect(files.get('checks.md')).toContain('- ``a`b``: the field');
  });
});
