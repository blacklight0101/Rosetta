## Screens: pages, forms and views

The code map found pages, forms, views or templates in this area. Besides the other cards, write one `SCRN` card for
each screen you have read: a page, form, view or template that a person sees or fills in. Skip a file that only
frames other screens (a master page) unless it has fields or actions of its own.

For a `SCRN` card, `type` is `SCRN` and the card has a `screen` object with:

- `route`: the route or page name as the code writes it, for example `/Orders/Checkout.aspx`.
- `roles`: the roles that can open it, only when the code says so; otherwise an empty list.
- `fields`: the inputs, each with `name`, `inputKind` (`text`, `dropdown`, `checkbox`, and so on), `required`
  (`true` or `false`) and `validations`. A validation has its own `text` and `citations`. Write only validations the
  code shows. Never invent a validation.
- `actions`: the buttons and links, each with a `label` and the `handler` it starts, the name of the method or
  handler in the code.
- `leadsTo`: the routes of the screens it leads to.

The `claims` of a `SCRN` card say what the screen shows and does, each with at least one citation. A rule you only
suspect, because the code seems to check something you cannot show in the lines you read, is not a validation. Write
an `OQ` card for it that cites the lines that raised the question.

Rosetta draws the screen map from `leadsTo`. Never write Mermaid or any other diagram, in a card or anywhere else.

Example of a screen in the `cards` list of your answer:

```json
{
  "cards": [
    {
      "type": "SCRN",
      "title": "Cancel order",
      "area": "orders",
      "summary": "Asks the customer to confirm the cancellation of an order.",
      "confidence": "High",
      "claims": [
        {
          "text": "The page shows the order number and a reason box with a Cancel button.",
          "citations": ["src/Orders/Cancel.aspx:4-9"]
        }
      ],
      "screen": {
        "route": "/Orders/Cancel.aspx",
        "roles": [],
        "fields": [
          {
            "name": "ReasonBox",
            "inputKind": "text",
            "required": true,
            "validations": [
              {
                "text": "The reason is required.",
                "citations": ["src/Orders/Cancel.aspx:6-6"]
              }
            ]
          }
        ],
        "actions": [{ "label": "Cancel order", "handler": "CancelButton_Click" }],
        "leadsTo": ["/Orders/List.aspx"]
      }
    }
  ]
}
```
