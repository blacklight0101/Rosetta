// RF-1303: whether the database answers, for GET /healthz.
export interface DatabaseHealth {
  /** True when the database answers a trivial query in time; never throws. */
  isReachable(): Promise<boolean>;
}
