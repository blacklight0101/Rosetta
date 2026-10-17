// RF-262 stub
export type Cardinality = 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more' | 'unknown';
export type FieldKey = 'PK' | 'FK' | 'UK';

export interface ModelField {
  readonly name: string;
  readonly type?: string | undefined;
  readonly keys?: readonly FieldKey[] | undefined;
}

export interface ModelEntity {
  readonly cardId: string;
  readonly name: string;
  readonly fields: readonly ModelField[];
}

export interface ModelRelation {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly fromCardinality: Cardinality;
  readonly toCardinality: Cardinality;
}

export interface EntityModel {
  readonly entities: readonly ModelEntity[];
  readonly relations: readonly ModelRelation[];
}

export function entityDiagram(model: EntityModel): string {
  return String(model.entities.length);
}
