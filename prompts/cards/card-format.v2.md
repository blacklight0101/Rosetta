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
  `question` and `whyItMatters`. Its `summary` says what the code shows, and its claims cite the code that raised
  the question. Never ask what the code, an area or the application does: read the code and write that as a card of
  another type. Good: "Who uses these pages?", "Why is the free-shipping threshold 50?". Refused: "What does this
  area do?", "What is the purpose of the application?", "What is the business logic of the checkout?".
- A statement about something that is missing from the code (for example "there is no authorisation check") is an
  `OQ` card that cites the place where the check would be.
- An area of third-party or generated code has no application logic: write no OQ card for it.
- Write titles, summaries and claims in English, in plain sentences.
