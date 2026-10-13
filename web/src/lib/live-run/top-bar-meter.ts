export type MeterLevel = 'ok' | 'warn' | 'danger';

export interface TopBarMeter {
  readonly share: number;
  readonly level: MeterLevel;
  readonly spent: string;
  readonly cap: string;
  readonly valueText: string;
}

// RF-1003 (stub for the red commit).
export function topBarMeterOf(_costMicros: number, _capMicros: number): TopBarMeter {
  return { share: 0, level: 'ok', spent: '', cap: '', valueText: '' };
}
