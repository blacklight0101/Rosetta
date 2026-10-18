// RF-500, RF-501, RF-507: the file names of the pages of areas and cards, all directly in `report/`.

/** The file name of the page of an area; the name is repository text, so it never reaches a path. */
export function areaPageName(area: string): string {
  return `${area}.html`;
}

/** The file name of the page of a card (the id is `TYPE-nnn`). */
export function cardPageName(cardId: string): string {
  return `${cardId}.html`;
}
