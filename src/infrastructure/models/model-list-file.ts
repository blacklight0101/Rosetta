import type { ModelList } from '../../application/models/model-list.js';

// RF-405, DEC-156: the model list file (`prices/models.yaml`).

export function parseModelList(text: string): ModelList {
  return { version: text.slice(0, 0), models: [] };
}

export function loadModelList(path: string): Promise<ModelList> {
  return Promise.resolve({ version: path.slice(0, 0), models: [] });
}
