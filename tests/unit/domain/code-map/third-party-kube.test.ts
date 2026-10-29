import { describe, expect, it } from 'vitest';
import { isThirdPartyFile } from '../../../../src/domain/code-map/third-party.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-104 (P7-03, DEC-195, EV-63): every file under a `.kube/schema` folder is generated, whatever
// its extension; the Haiku eShop run counted the extension-less ones as own code (1.39M tokens).

describe('RF-104 .kube/schema files', () => {
  it('RF-104 a file with no extension under .kube/schema is third-party', () => {
    const path = 'Kubernetes/eShopModernizedSQL-K8s/.kube/schema/v1.6.6/schema484738234';

    expect(isThirdPartyFile(entry(path, 93_147))).toBe(true);
  });

  it('RF-104 a file under .kube/schema is third-party with any extension, in any case', () => {
    for (const name of ['all.json', 'ALL.JSON', 'schema.yaml', 'notes.txt', 'swagger.json5']) {
      expect(isThirdPartyFile(entry(`.kube/SCHEMA/v1/${name}`, 50))).toBe(true);
    }
  });

  it('RF-104 a name that only ends in "json" without a dot is no longer a way out', () => {
    expect(isThirdPartyFile(entry('.kube/schema/v1/schemajson', 50))).toBe(true);
  });

  it('RF-104 a file beside the schema folder, or in a .kube folder without it, stays own code', () => {
    expect(isThirdPartyFile(entry('.kube/deployment.yaml', 50))).toBe(false);
    expect(isThirdPartyFile(entry('Kubernetes/schema/model.json', 50))).toBe(false);
  });
});
