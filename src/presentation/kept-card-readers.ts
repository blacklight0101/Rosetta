import type { FileStatReader, OutputWriter } from '../application/ports/output-writer.js';
import { FileRunCards } from '../infrastructure/cards/file-run-cards.js';
import { FilePriorCards } from '../infrastructure/cards/prior-cards.js';

// Architecture section 2 (composition root), RF-604, RF-1011, P5-28: the readers of the cards of a
// run are made once per output writer, so Plan setup's three reads (journey, plan estimate, plan
// source) and the plan run share the card files they parsed. A writer that cannot tell a file's
// version gets readers that keep nothing.

const canStat = (writer: OutputWriter): writer is OutputWriter & FileStatReader =>
  'statFile' in writer && typeof writer.statFile === 'function';

const runCards = new WeakMap<OutputWriter, FileRunCards>();
const priorCards = new WeakMap<OutputWriter, FilePriorCards>();

function statsOf(writer: OutputWriter): FileStatReader | undefined {
  return canStat(writer) ? writer : undefined;
}

/** The one reader of a run's cards over this writer. */
export function keptRunCards(writer: OutputWriter): FileRunCards {
  const known = runCards.get(writer);
  if (known !== undefined) return known;
  const made = new FileRunCards(writer, statsOf(writer));
  runCards.set(writer, made);
  return made;
}

/** The one reader of an earlier run's cards over this writer. */
export function keptPriorCards(writer: OutputWriter): FilePriorCards {
  const known = priorCards.get(writer);
  if (known !== undefined) return known;
  const made = new FilePriorCards(writer, statsOf(writer));
  priorCards.set(writer, made);
  return made;
}
