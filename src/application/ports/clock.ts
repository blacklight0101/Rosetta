// RNF-004: the only source of time for domain and application code (architecture section 12).
export interface Clock {
  now(): Date;
}
