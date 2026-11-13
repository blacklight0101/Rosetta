import type { AdrModelMessageInput } from '../plan/adr-model-message.js';

// RF-613, RF-623, P9-15, ADR-007: the decision records and the tables the check of the data model
// will send do not exist before the run. The estimate sizes the call for a typical plan: 10 records
// that name a stored structure (a 100 character title and a 400 character context, decision and
// consequences) and 30 tables (a 40 character name, a 150 character purpose and 12 columns of 30
// characters). It is an assumption, not a bound; the budget guard still enforces the caps.
const DECISIONS = 10;
const TABLES = 30;
const COLUMNS = 12;

// RF-613, RF-623
export function assumedAdrModelInput(): AdrModelMessageInput {
  const text = 'a'.repeat(400);
  const decisions = Array.from({ length: DECISIONS }, (_, index) => ({
    ...{ id: `ADR-${String(index)}`, title: 'a'.repeat(100) },
    ...{ context: text, decision: text, consequences: text },
  }));
  const tables = Array.from({ length: TABLES }, () => ({
    ...{ name: 'a'.repeat(40), purpose: 'a'.repeat(150) },
    columns: Array.from({ length: COLUMNS }, () => ({ name: 'a'.repeat(30) })),
  }));
  return { decisions, tables };
}
