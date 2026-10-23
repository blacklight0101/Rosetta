import { describe, expect, it } from 'vitest';
import { fixtureRoot, scanTree } from '../../../support/scan-harness.js';

describe('universal scan of the IDE, backup and publish fixture', () => {
  it('RF-100 leaves the IDE and backup folders out, lists them as ignored and keeps the pages', async () => {
    const { scan } = await scanTree(fixtureRoot('ide-backup-publish'));

    expect(scan.files.map((file) => file.path)).toEqual([
      'Contact.aspx',
      'Default.aspx',
      'Orders.aspx',
      'Properties/PublishProfiles/Staging.pubxml',
    ]);
    expect(scan.ignored).toEqual([
      { path: '.vs', rule: 'IDE settings', files: 1 },
      { path: 'Backup', rule: 'backup copy', files: 1 },
    ]);
  });

  it('RF-102 marks the publish profile as build and deployment configuration', async () => {
    const { scan } = await scanTree(fixtureRoot('ide-backup-publish'));
    const profile = scan.files.find((file) => file.path.endsWith('.pubxml'));

    expect(profile?.artefactKinds).toEqual(['deployment']);
  });
});
