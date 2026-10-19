import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeRepositoryReader } from '../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { parseCodeMap } from '../../../src/infrastructure/scan/codemap/codemap-json.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { createScanRunHarness, scanActor } from '../../support/scan-run-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { bodyOf, projectId, requestOf, storeIn } from '../../support/upload-store-harness.js';
import { buildZip } from '../../support/zip-fixtures.js';

// RF-147, RF-140, RF-129: the zip is stored whole (an upload is not filtered on the way in), but a
// secret file or a path the repository ignores never reaches the code map and is refused to every
// reader, so it can never be sent to a provider.

const temp = useTempRoot('rosetta-upload-deny-');

const zip = () =>
  buildZip([
    { name: 'OrderDesk/src/Orders.cs', data: 'class Orders { }' },
    {
      name: 'OrderDesk/.env',
      data: ['API_KEY', ['sk', 'live', '0123456789abcdef0123456789abcdef'].join('-')].join('='),
    },
    {
      name: 'OrderDesk/config/.env.production',
      data: ['DB_PASS' + 'WORD', 'hunter2' + 'hunter2'].join('='),
    },
    { name: 'OrderDesk/keys/id_rsa', data: ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' ') },
    { name: 'OrderDesk/keys/server.pem', data: ['-----BEGIN', 'CERTIFICATE-----'].join(' ') },
    { name: 'OrderDesk/.rosettaignore', data: 'legacy/\n' },
    { name: 'OrderDesk/legacy/Old.cs', data: 'class OldSecretBusinessRule { }' },
  ]);

async function scanUpload() {
  const store = storeIn(temp.path);
  const stored = await store.store(requestOf(bodyOf(await zip()), { projectId }));
  const snapshot = await store.read(stored.key);
  if (snapshot === undefined) throw new Error('The snapshot was not stored');
  const h = await createScanRunHarness({
    dataDir: temp.path,
    project: {
      ...{ id: projectId, userId: scanActor.userId, sourceKind: 'upload', sourceUrl: '' },
      ...{ ref: '', subpath: '' },
      upload: { fileName: 'OrderDesk.zip', uploadedAt: 1, snapshotKey: stored.key },
    },
    uploads: store,
  });
  const run = await h.scan();
  const mapText = await readFile(
    join(
      temp.path,
      'users',
      scanActor.userId,
      'projects',
      projectId,
      'runs',
      run.runKey,
      'codemap.json',
    ),
    'utf8',
  );
  const parsed = parseCodeMap(mapText);
  if (!parsed.ok) throw new Error('The code map is not valid');
  const logger = new MemoryLogger(new FixedClock('2026-10-19T08:00:00.000Z'), new SecretMasker());
  const reader = await NodeRepositoryReader.open({
    root: snapshot.rootDir,
    ...{ ignoreRules: '', allowDenied: [], logger },
  });
  return { run, files: parsed.value.files.map((file) => file.path), reader, mapText };
}

describe('an uploaded zip with secret files and a .rosettaignore', () => {
  it('RF-147 RF-140 leaves the secret files and the ignored folder out of the code map', async () => {
    const { run, files, mapText } = await scanUpload();

    expect(run.endState).toBe('Completed');
    expect(files).toContain('src/Orders.cs');
    expect(files.filter((path) => /env|id_rsa|\.pem|legacy/u.test(path))).toEqual([]);
    expect(mapText).not.toContain('OldSecretBusinessRule');
  });

  it.each(['.env', 'config/.env.production', 'keys/id_rsa', 'keys/server.pem'])(
    'RF-147 refuses to read %s as a secret file',
    async (path) => {
      const { reader } = await scanUpload();

      const read = await reader.readLines({ path, startLine: 1, endLine: 5 });

      expect(read.ok).toBe(false);
      expect(!read.ok && read.error.reason).toBe('denied');
    },
  );

  it('RF-140 refuses to read a path the .rosettaignore of the zip names', async () => {
    const { reader } = await scanUpload();

    const read = await reader.readLines({ path: 'legacy/Old.cs', startLine: 1, endLine: 5 });

    expect(!read.ok && read.error.reason).toBe('ignored');
  });

  it('RF-147 a search over the whole snapshot finds no line of a secret or ignored file', async () => {
    const { reader } = await scanUpload();

    const found = await reader.grep({ pattern: 'sk-live|hunter2|BEGIN|OldSecret' });

    expect(found.ok && found.value.matches).toEqual([]);
    expect(await reader.listFiles()).toEqual(['.rosettaignore', 'src/Orders.cs']);
  });
});
