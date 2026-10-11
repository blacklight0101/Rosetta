/**
 * RF-110, RF-112: how deeply a file (or an area) is mapped. `symbols` when a language pack mapped
 * it, `coarse` otherwise (no pack, a skipped file, or a pack that failed on the file).
 */
export type MapLevel = 'coarse' | 'symbols';
