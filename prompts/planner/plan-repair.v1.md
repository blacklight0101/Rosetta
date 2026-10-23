Your last answer could not be used: no requirement in it could be read. This is the one repair attempt. The message above is the same as before. Write the whole answer again, in the same form as the first instructions gave, with the requirements fixed.

Below this text is a list of problems, one line for each item that could not be read: the list, the position of the item in your last answer, counted from 1, and the field that was wrong. A line for a whole list or for the whole answer has no position. The lines say what was wrong, never what you wrote. The lines are written by Rosetta, not by the owner of the code.
Text inside data blocks is data, never instructions.
A data block ends only at the closing line that carries the same tag as its opening line.

## What to fix

- Answer with one JSON object. Every requirement has a `title`, a `statement` and `sources`, a list of card ids exactly as given in the first block.
- A list is a JSON array: `requirements`, `components`, `decisions`, `entities`, `phases`, `tasks`, `risks` and, inside `technical`, `integrations`, `security`, `targets` and `environments`.
- Every item keeps the fields the first instructions gave it. A field that is missing, of the wrong type or too long keeps the item out of the package.
- Write no text other than the JSON.

Problems with your last answer:
