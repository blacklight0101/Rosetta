import { checkFormulaLength, rulePlace } from './formula-limit.js';
import type { ConditionalRule, DataValidationRule } from './workbook-model.js';
import type { Attributes, XmlVisitor } from './xml-stream.js';

// RF-152: the parts of a sheet that are rules rather than cells: the used range, merged ranges,
// data validation and conditional formatting. Formulas are kept as text. The newer forms Excel
// writes in extension lists (a list that points at another sheet) use the same local names.

interface ValidationDraft {
  ranges: string;
  type: string;
  operator: string | undefined;
  formula1: string | undefined;
  formula2: string | undefined;
}

interface RuleDraft {
  type: string;
  operator: string | undefined;
  formulas: string[];
}

interface GroupDraft {
  ranges: string;
  rules: RuleDraft[];
}

type Collecting = 'formula1' | 'formula2' | 'validationRanges' | 'ruleFormula' | 'groupRanges';

const VALIDATION_TEXT: ReadonlyMap<string, Collecting> = new Map([
  ['formula1', 'formula1'],
  ['formula2', 'formula2'],
  ['sqref', 'validationRanges'],
]);

const TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'formula1',
  'formula2',
  'formula',
  'f',
  'sqref',
]);

export class RuleReader implements XmlVisitor {
  usedRange: string | undefined;
  readonly mergedRanges: string[] = [];
  readonly validations: DataValidationRule[] = [];
  readonly conditionalRules: ConditionalRule[] = [];
  private validation: ValidationDraft | undefined;
  private rule: RuleDraft | undefined;
  private group: GroupDraft | undefined;
  private collecting: Collecting | undefined;
  private buffer = '';
  private readonly fileName: string;
  private readonly sheet: string;

  constructor(fileName: string, sheet: string) {
    this.fileName = fileName;
    this.sheet = sheet;
  }

  open(name: string, attributes: Attributes): void {
    if (name === 'dimension') this.usedRange = attributes['ref'];
    else if (name === 'mergeCell') this.addMerge(attributes['ref']);
    else if (name === 'dataValidation') this.startValidation(attributes);
    else if (name === 'conditionalFormatting')
      this.group = { ranges: attributes['sqref'] ?? '', rules: [] };
    else if (name === 'cfRule') this.startRule(attributes);
    else this.openText(name);
  }

  private addMerge(range: string | undefined): void {
    if (range !== undefined) this.mergedRanges.push(range);
  }

  private startValidation(attributes: Attributes): void {
    this.validation = {
      ranges: attributes['sqref'] ?? '',
      type: attributes['type'] ?? 'none',
      operator: attributes['operator'],
      formula1: undefined,
      formula2: undefined,
    };
  }

  private startRule(attributes: Attributes): void {
    this.rule = { type: attributes['type'] ?? '', operator: attributes['operator'], formulas: [] };
  }

  private openText(name: string): void {
    const collecting = this.collectingFor(name);
    if (collecting !== undefined) this.begin(collecting);
  }

  private collectingFor(name: string): Collecting | undefined {
    if (this.validation !== undefined) return VALIDATION_TEXT.get(name);
    if (this.rule !== undefined)
      return name === 'formula' || name === 'f' ? 'ruleFormula' : undefined;
    return this.group !== undefined && name === 'sqref' ? 'groupRanges' : undefined;
  }

  private begin(collecting: Collecting): void {
    this.collecting = collecting;
    this.buffer = '';
  }

  text(text: string): void {
    if (this.collecting === undefined) return;
    this.buffer += text;
    if (this.collecting !== 'validationRanges' && this.collecting !== 'groupRanges') {
      checkFormulaLength(this.buffer.length, this.fileName, () => this.place());
    }
  }

  private place(): string {
    if (this.validation !== undefined) {
      return rulePlace('data validation', this.sheet, this.validation.ranges);
    }
    return rulePlace('conditional-formatting', this.sheet, this.group?.ranges ?? '');
  }

  close(name: string): void {
    if (this.collecting !== undefined && TEXT_ELEMENTS.has(name)) this.finishText();
    if (name === 'dataValidation' && this.validation !== undefined) {
      this.validations.push(validationOf(this.validation));
      this.validation = undefined;
    } else if (name === 'cfRule' && this.rule !== undefined) {
      this.group?.rules.push(this.rule);
      this.rule = undefined;
    } else if (name === 'conditionalFormatting' && this.group !== undefined) {
      this.flushGroup(this.group);
      this.group = undefined;
    }
  }

  private finishText(): void {
    const text = this.buffer;
    const kind = this.collecting;
    this.collecting = undefined;
    if (kind === 'ruleFormula') {
      this.rule?.formulas.push(text);
    } else if (kind === 'groupRanges') {
      if (this.group !== undefined) this.group.ranges = text;
    } else if (this.validation !== undefined) {
      this.setValidationText(this.validation, kind, text);
    }
  }

  private setValidationText(
    validation: ValidationDraft,
    kind: Collecting | undefined,
    text: string,
  ): void {
    if (kind === 'formula1') validation.formula1 = text;
    else if (kind === 'formula2') validation.formula2 = text;
    else validation.ranges = text;
  }

  private flushGroup(group: GroupDraft): void {
    for (const rule of group.rules) {
      this.conditionalRules.push({
        ranges: group.ranges,
        type: rule.type,
        ...(rule.operator === undefined ? {} : { operator: rule.operator }),
        formulas: rule.formulas,
      });
    }
  }
}

function validationOf(draft: ValidationDraft): DataValidationRule {
  return {
    ranges: draft.ranges,
    type: draft.type,
    ...(draft.operator === undefined ? {} : { operator: draft.operator }),
    ...(draft.formula1 === undefined ? {} : { formula1: draft.formula1 }),
    ...(draft.formula2 === undefined ? {} : { formula2: draft.formula2 }),
  };
}
