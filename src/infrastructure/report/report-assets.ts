import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-506, RF-1013: the stylesheet and the script every report folder gets, shipped in
// `templates/report/`. The pages load them as files of their own folder, so the content security
// policy needs no inline allowance.

export type ReportAssets = Readonly<Record<'report.css' | 'replay.js', string>>;

async function readAsset(folder: string, name: string): Promise<string> {
  try {
    return await readFile(join(folder, name), 'utf8');
  } catch (error) {
    throw new RosettaError(
      ERROR_CODES.configurationInvalid,
      `The report template ${name} cannot be read.`,
      { cause: error },
    );
  }
}

/** Reads the assets from the templates folder; rejects with RST-1000 when one cannot be read. */
// RF-506
export async function loadReportAssets(folder: string): Promise<ReportAssets> {
  return {
    'report.css': await readAsset(folder, 'report.css'),
    'replay.js': await readAsset(folder, 'replay.js'),
  };
}
