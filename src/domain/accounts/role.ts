// RF-1102, DEC-66: the two roles (architecture section 5); changed only by an administrator.
export const ROLES = ['admin', 'user'] as const;

export type Role = (typeof ROLES)[number];
