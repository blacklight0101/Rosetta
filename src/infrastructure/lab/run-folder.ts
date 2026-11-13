/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
import { createHash } from 'node:crypto';
import type { CapturedRun } from '../../application/lab/capture/capture-types.js';
import { err, type Result } from '../../domain/errors/result.js';

// RF-1404: stub, the behaviour comes with the feature commit (the hash is already real).

// RF-1404
export function readRunFolder(path: string, _key: string): Promise<Result<CapturedRun, string>> {
  return Promise.resolve(err(`${path} cannot be read yet.`));
}

// RF-1404
export function writeCaseSetFile(
  _casesFolder: string,
  _name: string,
  _data: unknown,
): Promise<string> {
  return Promise.resolve('');
}

// RF-1404
export function readJsonFile(_path: string): Promise<unknown> {
  return Promise.resolve({});
}

// RF-1405
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
