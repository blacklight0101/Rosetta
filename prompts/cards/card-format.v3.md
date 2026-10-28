## Final answer: cards

When you have finished exploring your area, reply with one JSON object and nothing else. You may put it in a
fenced `json` block. The object has one key, `cards`, a list of cards:

```json
{
  "cards": [
    {
      "type": "BR",
      "title": "Free shipping over 50",
      "area": "orders",
      "summary": "Orders above 50 are shipped without a charge.",
      "confidence": "High",
      "claims": [
        {
          "text": "The shipping fee is zero when the basket total is above 50.",
          "citations": ["src/Orders/Shipping.cs:12-30"]
        }
      ]
    },
    {
      "type": "OQ",
      "title": "Why is the free-shipping threshold 50?",
      "area": "orders",
      "summary": "The shipping fee is zero above a basket total of 50.",
      "confidence": "Medium",
      "question": "Why is the free-shipping threshold 50?",
      "whyItMatters": "The threshold decides which orders pay for shipping.",
      "claims": [
        {
          "text": "The threshold 50 is a literal in the shipping fee calculation.",
          "citations": ["src/Orders/Shipping.cs:12-30"]
        }
      ],
      "suggestedAnswers": [
        {
          "answer": "A business rule set by the shop owner",
          "description": "The threshold is a pricing decision; a rewrite keeps it as a setting the owner can change.",
          "recommended": true,
          "citations": ["src/Orders/Shipping.cs:12-30"]
        },
        {
          "answer": "A legacy default nobody revisited",
          "description": "The value is old; a rewrite should confirm it with the owner before copying it."
        },
        {
          "answer": "Yes, but only for domestic orders",
          "description": "The threshold applies to some destinations only; a rewrite needs the list of destinations."
        }
      ]
    }
  ]
}
```

Rules:

- `type` is one of `FEAT` (a feature a user can use), `BR` (a business rule), `ENT` (a data entity), `INT` (an
  integration with another system) or `OQ` (an open question the code cannot answer).
- `confidence` is `High`, `Medium` or `Low`. It is your confidence; you set it, nobody else.
- Every card has at least one claim. Every claim has at least one citation written `path:startLine-endLine`: the
  path relative to the repository root with forward slashes, line numbers as plain numbers, 1-based, the start not
  after the end. A claim without a citation is rejected.
- Cite only lines you have read with the tools.
- An `OQ` card is a question for the person who owns the application, about something the code cannot tell:
  business intent, the reason for a rule, an external system, data volumes or who uses a feature. It has
  `question`, `whyItMatters` and `suggestedAnswers`. Its `summary` says what the code shows, and its claims cite the code that raised
  the question. Never ask what the code, an area or the application does: read the code and write that as a card of
  another type. Good: "Who uses these pages?", "Why is the free-shipping threshold 50?". Refused: "What does this
  area do?", "What is the purpose of the application?", "What is the business logic of the checkout?".
- A statement about something that is missing from the code (for example "there is no authorisation check") is an
  `OQ` card that cites the place where the check would be.
- An area of third-party or generated code has no application logic: write no OQ card for it.
- Write titles, summaries and claims in English, in plain sentences.
- An `OQ` card carries `suggestedAnswers`: three answers the person may choose from, as the options of a
  multiple-choice question. Each has `answer` (a short answer), `description` (one sentence on what the answer
  means and what follows from it) and `recommended`. Exactly one answer has `recommended` true, and it is listed
  first: it is the answer that applies when the question is skipped, so choose the one the code supports best.
  Add `citations` (`path:startLine-endLine`, lines you have read) to an answer only when the code supports it.
  When the question has two natural answers, such as yes and no, the third answer is a qualified one, for example
  "Yes, but only when a condition holds", never filler. An `OQ` card without three suggested answers is refused.
