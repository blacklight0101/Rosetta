// RF-402: loads a `.env` file of the repository into process.env when it exists. A variable the
// environment already sets keeps its value (process.loadEnvFile never overrides), so an exported
// key still wins over the file. A missing file is not an error: the script then reports the key
// it needs.
import { access } from 'node:fs/promises';

/** Loads `path` when it exists; true when it was loaded. */
export async function loadEnvFileIfPresent(path) {
  try {
    await access(path);
  } catch {
    return false;
  }
  process.loadEnvFile(path);
  return true;
}
