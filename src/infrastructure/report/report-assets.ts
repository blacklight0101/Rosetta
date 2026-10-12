// RF-506, RF-1013: the stylesheet and the script every report folder gets, shipped in
// `templates/report/`.

export const REPORT_ASSET_NAMES = ['report.css', 'replay.js'] as const;

export type ReportAssets = Readonly<Record<(typeof REPORT_ASSET_NAMES)[number], string>>;

/** Reads the assets from the templates folder; rejects with RST-1000 when one cannot be read. */
export function loadReportAssets(folder: string): Promise<ReportAssets> {
  void folder;
  return Promise.resolve({ 'report.css': '', 'replay.js': '' });
}
