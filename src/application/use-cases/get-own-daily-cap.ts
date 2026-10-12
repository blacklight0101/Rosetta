import type { Actor } from '../../domain/accounts/actor.js';
import type { UserRepository } from '../ports/user-repository.js';

// DEC-107, RF-1106: the signed-in user reads the optional daily cap on their own keys; null means
// none. Only the actor's own account is read (RF-1105).

export class GetOwnDailyCap {
  private readonly users: UserRepository;

  constructor(deps: { readonly users: UserRepository }) {
    this.users = deps.users;
  }

  // RF-1106
  async execute(request: { readonly actor: Actor }): Promise<bigint | null> {
    const account = await this.users.findById(request.actor.userId);
    return account?.ownDailyCapMicros ?? null;
  }
}
