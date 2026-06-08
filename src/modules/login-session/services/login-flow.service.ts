import { randomUUID } from "node:crypto"
import type { LoginFlowResult } from "../domain/login-flow-result.js"
import type { IdentityRegisteredUserForAuthRepository } from "../persistence/identity-registered-user-for-auth.repository.js"
import type { AuthSessionRepository } from "../persistence/session.repository.js"
import { loginSessionExpiresAt } from "../policies/session-expiry.policy.js"
import { verifyIdentityRegisteredUserPassword } from "./credential-verification.service.js"
import {
  generateOpaqueSessionToken,
  hashSessionTokenForStorage,
} from "./opaque-session-token.js"

/**
 * Caso de uso login email + contraseña (OP-L1). La capa HTTP llega en el siguiente incremento.
 */
export class LoginFlowService {
  constructor(
    private readonly registeredUsers: IdentityRegisteredUserForAuthRepository,
    private readonly sessions: AuthSessionRepository,
  ) {}

  /**
   * Autenticación con email normalizado y contraseña en claro (solo invocar tras validar entrada).
   */
  async executeEmailPasswordLogin(
    emailNormalized: string,
    plainPassword: string,
  ): Promise<LoginFlowResult> {
    const user =
      await this.registeredUsers.findByEmailNormalized(emailNormalized)
    if (
      !user ||
      !verifyIdentityRegisteredUserPassword(plainPassword, user.passwordHash)
    ) {
      return { ok: false, reason: "invalid_credentials" }
    }

    const opaqueAccessToken = generateOpaqueSessionToken()
    const tokenHash = hashSessionTokenForStorage(opaqueAccessToken)
    const sessionPublicId = randomUUID()
    const expiresAt = loginSessionExpiresAt()

    const session = await this.sessions.create({
      sessionPublicId,
      userPublicId: user.userPublicId,
      tokenHash,
      expiresAt,
    })

    return { ok: true, session, opaqueAccessToken }
  }
}
