import type { AuthenticatedUserProfile } from "../domain/authenticated-user-profile.entity.js"
import type { IdentityRegisteredUserForAuthRepository } from "../persistence/identity-registered-user-for-auth.repository.js"
import { verifyIdentityRegisteredUserPassword } from "./credential-verification.service.js"
import {
  normalizeAccountFullName,
  validateAccountFullName,
  validateIntentPasswordPlain,
} from "../../registro-onboarding/domain/account-credentials.policy.js"
import { hashIdentityRegistrationIntentPassword } from "../../registro-onboarding/services/intent-password-hash.js"
import type { PatchAuthProfileBody } from "../validation/profile.schemas.js"

export type ProfileUpdateFailure =
  | { code: "invalid_full_name"; message: string }
  | { code: "invalid_new_password"; message: string }
  | { code: "invalid_current_password"; message: string }
  | { code: "no_effective_change"; message: string }
  | { code: "user_not_found"; message: string }
  | { code: "persist_failed"; message: string }

export type ProfileUpdateResult =
  | { ok: true; user: AuthenticatedUserProfile }
  | { ok: false; failure: ProfileUpdateFailure }

/**
 * Actualiza `fullName` y/o contraseña del `IdentityRegisteredUser` identificado por sesión (Bearer).
 */
export class ProfileUpdateService {
  constructor(private readonly users: IdentityRegisteredUserForAuthRepository) {}

  async execute(
    userPublicId: string,
    body: PatchAuthProfileBody,
  ): Promise<ProfileUpdateResult> {
    const row = await this.users.findCredentialByUserPublicId(userPublicId)
    if (!row) {
      return {
        ok: false,
        failure: {
          code: "user_not_found",
          message: "No se encontró el usuario registrado.",
        },
      }
    }

    const wantsName = body.fullName !== undefined
    const wantsPassword =
      body.newPassword !== undefined && String(body.newPassword).length > 0

    let nextFullName = row.fullName
    if (wantsName) {
      const normalized = normalizeAccountFullName(body.fullName!)
      const nameIssue = validateAccountFullName(normalized)
      if (nameIssue === "invalid_full_name") {
        return {
          ok: false,
          failure: {
            code: "invalid_full_name",
            message:
              "El nombre completo no cumple la política (longitud y formato).",
          },
        }
      }
      nextFullName = normalized
    }

    let nextHash = row.passwordHash
    if (wantsPassword) {
      const pwdIssue = validateIntentPasswordPlain(body.newPassword!)
      if (pwdIssue === "invalid_password") {
        return {
          ok: false,
          failure: {
            code: "invalid_new_password",
            message:
              "La nueva contraseña debe tener entre 8 y 128 caracteres.",
          },
        }
      }
      if (
        !body.currentPassword ||
        !verifyIdentityRegisteredUserPassword(body.currentPassword, row.passwordHash)
      ) {
        return {
          ok: false,
          failure: {
            code: "invalid_current_password",
            message: "La contraseña actual no es correcta.",
          },
        }
      }
      nextHash = hashIdentityRegistrationIntentPassword(body.newPassword!)
    }

    const nameChanged = nextFullName !== row.fullName
    const passwordChanged = nextHash !== row.passwordHash
    if (!nameChanged && !passwordChanged) {
      return {
        ok: false,
        failure: {
          code: "no_effective_change",
          message: "No hay cambios respecto a los datos actuales.",
        },
      }
    }

    const updates: { fullName?: string; passwordHash?: string } = {}
    if (nameChanged) updates.fullName = nextFullName
    if (passwordChanged) updates.passwordHash = nextHash

    const ok = await this.users.applyProfileUpdates(userPublicId, updates)
    if (!ok) {
      return {
        ok: false,
        failure: {
          code: "persist_failed",
          message: "No se pudo guardar el perfil.",
        },
      }
    }

    const profile = await this.users.findProfileByUserPublicId(userPublicId)
    if (!profile) {
      return {
        ok: false,
        failure: {
          code: "user_not_found",
          message: "No se pudo leer el perfil actualizado.",
        },
      }
    }

    return { ok: true, user: profile }
  }
}
