import { createHash } from 'node:crypto';

// RF-500, RF-501, RF-507: the file names of the pages of areas and cards, all directly in `report/`
// (the server serves the pages that are direct files of that folder). An area name is repository
// text, so only plain characters of it reach a file name; a short hash of the whole name keeps two
// areas that differ only in case or in other characters apart.

const SLUG_LENGTH = 30;

function slugOf(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, SLUG_LENGTH)
    .replace(/-+$/u, '');
}

/** The file name of the page of an area: `area-<slug>-<hash>.html`. */
// RF-501
export function areaPageName(area: string): string {
  const hash = createHash('sha256').update(area, 'utf8').digest('hex').slice(0, 8);
  const slug = slugOf(area);
  return `area-${slug === '' ? '' : `${slug}-`}${hash}.html`;
}

/** The file name of the page of a card (the id is `TYPE-nnn`, checked when the card is read). */
export function cardPageName(cardId: string): string {
  return `card-${cardId}.html`;
}
