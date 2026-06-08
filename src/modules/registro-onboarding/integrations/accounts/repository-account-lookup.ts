import type { IdentityRegisteredUserForAuthRepository } from "../../../login-session/persistence/identity-registered-user-for-auth.repository.js"
import type { AccountLookupPort } from "./account-lookup.port.js"
import type { ProvisionalEnvAccountLookup } from "./account-lookup.port.js"

/**
 * Elegibilidad Fase A: lista env (dev) + usuarios materializados vía repositorio activo.
 */
export class RepositoryAccountLookup implements AccountLookupPort {
  constructor(
    private readonly envLookup: ProvisionalEnvAccountLookup,
    private readonly registeredUsers: IdentityRegisteredUserForAuthRepository,
  ) {}

  async isEmailRegistered(normalizedEmail: string): Promise<boolean> {
    if (await this.envLookup.isEmailRegistered(normalizedEmail)) {
      return true
    }
    const row = await this.registeredUsers.findByEmailNormalized(normalizedEmail)
    return row !== null
  }
}
