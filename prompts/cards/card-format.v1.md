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
- An `OQ` card also has `question` and `whyItMatters`. A statement about something that is missing from the code
  (for example "there is no authorisation check") is an `OQ` card that cites the place where the check would be.
- Write titles, summaries and claims in English, in plain sentences.
