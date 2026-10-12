import type { ServerCaps } from '../../domain/budget/budget.js';
import type { ServerSettings } from '../ports/server-settings.js';

// RF-1106, DEC-107: the administrator reads the caps on the server keys (run, user day, server
// month) from the server settings; the route allows administrators only.

export class GetCaps {
  private readonly settings: ServerSettings;

  constructor(deps: { readonly settings: ServerSettings }) {
    this.settings = deps.settings;
  }

  // RF-1106
  execute(): Promise<ServerCaps> {
    return this.settings.caps();
  }
}
