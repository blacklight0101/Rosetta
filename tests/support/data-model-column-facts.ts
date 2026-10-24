import { readFile } from 'node:fs/promises';
import { parseDataModelAnswer } from '../../src/application/plan/data-model-answer.js';
import { assembleDataModel } from '../../src/domain/planning/data-model-assembly.js';
import { legacyClaimsOf, type TargetDataModel } from '../../src/domain/planning/data-model.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import { card } from './data-model-sqlserver-orders.js';

// P5-37: a synthetic `Staff` entity card whose claims state each column with its type, nullability
// and default in the form the reader prompt asks for, and the claim that states what is missing
// (no primary key; the code finds a member by name). Nothing here comes from a real application.

export function staffCards(): SourceCard[] {
  return [
    card('ENT-001', 'ENT', 'Staff', [
      'Column Staff.Name: varchar(30), NOT NULL.',
      'Column Staff.Rating: float, NOT NULL.',
      'Column Staff.Patients_Treated: int, NOT NULL, default 0.',
      'Column Staff.Salary: float, NOT NULL.',
      'Column Staff.Address: nvarchar(60), NULL.',
      'Staff has no primary key and no unique constraint; the code finds a member by Name.',
    ]),
  ];
}

/** The model a recorded planner answer gives once the parser and the domain checks have read it. */
export async function staffModel(database: string | null = 'PostgreSQL'): Promise<TargetDataModel> {
  const url = new URL('../fixtures/planner/data-model-clinic-staff-wrong.json', import.meta.url);
  const parsed = parseDataModelAnswer(await readFile(url, 'utf8'));
  if (parsed === undefined) throw new Error('The recorded answer has no tables');
  return assembleDataModel(parsed.draft, legacyClaimsOf(staffCards()), database).model;
}
