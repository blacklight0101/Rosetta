// P9-13, EV-89, EV-57, EV-69: synthetic questions modelled on the shape of the near-repeat pairs the
// eShop evaluation found (public eShopOnWeb sample vocabulary only: catalog, basket, order, Azure).
// Each pair lists the two wordings of one question; `distinct` pairs ask different things.

export const nearRepeatPairs: readonly (readonly [string, string])[] = [
  // OQ-045/OQ-046 shape (0.77): one word swapped and one added
  [
    'Which catalog item fields does the basket validate before checkout creates an order for a signed-in customer?',
    'Which catalog item fields does the basket check early before checkout creates an order for a signed-in customer?',
  ],
  // OQ-050/OQ-053 shape: each wording adds words of its own
  [
    'Who may change the price of a catalog item after the item is published to the online web shop for retail customers?',
    'Who is allowed to change the price of a catalog item once the item is published to the online web shop for retail customers?',
  ],
  // OQ-058/OQ-061 shape: what against which, and a rewording
  [
    'Which Azure services does the web shop use to store basket data between visits of a signed-in customer?',
    'What Azure services does the web shop depend on directly to store the basket data between visits of a signed-in customer?',
  ],
];

export const distinctPairs: readonly (readonly [string, string])[] = [
  [
    'Which catalog item fields does the basket validate before checkout creates an order for a signed-in customer?',
    'Which catalog item fields does the basket validate before checkout creates a shipment for a signed-in customer?',
  ],
  ['How is the nightly export job scheduled?', 'How is the nightly import job scheduled?'],
];

/** OQ-062 shape: a question with two sides, and the answer the model gave. */
export const eitherOrQuestion =
  "Is the catalog run by this application's team or by another system?";
export const eitherOrYesBut = 'Yes, but only as a shared catalog read by the web shop';
