import { stringify } from 'yaml';
import type { ApiOperation } from '../../domain/planning/api-contract.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import { openApiDocument } from '../../domain/planning/openapi-document.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-624, RF-603, RNF-003, DEC-125: `api/openapi.yaml` of the hand-off package. The document is built
// by code (the domain), its free texts masked, and the YAML comes from the serializer only, never
// from joining strings, so a hostile name or summary stays one quoted value: it adds no key. Anchors
// and aliases are off, and strings that older YAML (1.1) would read as a boolean or a number, such as
// a column named `no`, are quoted.

// RF-624
export function openApiYaml(
  operations: readonly ApiOperation[],
  model: TargetDataModel,
  masker: TextMasker,
): string {
  const document = openApiDocument(operations, model, (text) => masker.mask(text).text);
  return stringify(document, { aliasDuplicateObjects: false, lineWidth: 0, version: '1.1' });
}
