## Flows: journeys that start at an entry point

The code map found entry points in this area: a page action, an HTTP handler, a scheduled job or a message
handler. Besides the other cards, write one `FLOW` card for each end-to-end journey that starts at one of them and
that you have followed in the code. A journey is what happens from its trigger to its outcome, across every file it
touches. Follow the calls with `read_file`, `grep` and `codemap_query` before you describe it.

For a `FLOW` card, `type` is `FLOW` and the card has a `flow` object with:

- `trigger`: what starts the journey, in one sentence (the button pressed, the request received, the schedule, the
  message).
- `outcome`: what is true when the journey ends.

The `claims` of a `FLOW` card are its steps, in the order they happen. A step is one claim: one sentence saying what
happens, with at least one citation to the lines that do it. A step may also have:

- `branches`: the error or alternative paths of that step, each with its own `text` and `citations`. Write only
  the branches the code shows.
- `target`: leave it out. Rosetta gives cards their ids numbered after your answer, so you cannot know the id of the
  screen, rule, entity or integration a step touches. Name what the step touches in its text instead: the page, the
  rule, the table or the other system.

A path you only suspect, because the code seems to allow it but you cannot show it in the lines you read, is not a
step or a branch. Write an `OQ` card for it that cites the lines that raised the question.

Rosetta draws the diagrams from your steps. Never write Mermaid or any other diagram, in a card or anywhere else.

Example of a flow in the `cards` list of your answer:

```json
{
  "cards": [
    {
      "type": "FLOW",
      "title": "Cancel an order",
      "area": "orders",
      "summary": "A customer cancels an order that has not shipped.",
      "confidence": "High",
      "flow": {
        "trigger": "The customer presses Cancel on the order page.",
        "outcome": "The order is marked cancelled and the customer sees the order list."
      },
      "claims": [
        {
          "text": "The order page reads the order and stops when it has already shipped.",
          "citations": ["src/Orders/Cancel.aspx.cs:10-16"],
          "branches": [
            {
              "text": "A shipped order shows a message and nothing changes.",
              "citations": ["src/Orders/Cancel.aspx.cs:14-15"]
            }
          ]
        },
        {
          "text": "The order service sets the order state to cancelled and the page redirects to the order list.",
          "citations": ["src/Orders/Cancel.aspx.cs:17-20"]
        }
      ]
    }
  ]
}
```
