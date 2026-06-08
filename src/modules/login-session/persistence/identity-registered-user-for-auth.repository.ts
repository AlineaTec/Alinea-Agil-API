import type { AuthenticatedUserProfile } from "../domain/authenticated-user-profile.entity.js"

/**
 * Subconjunto de `IdentityRegisteredUser` necesario para autenticación (puerto de persistencia).
 */
export type IdentityRegisteredUserAuthRecord = {
  userPublicId: string
  emailNormalized: string
  passwordHash: string
}

/** Credencial + nombre para PATCH perfil (no exponer al HTTP). */
export type IdentityRegisteredUserCredentialRecord = {
  userPublicId: string
  fullName: string
  passwordHash: string
}

export interface IdentityRegisteredUserForAuthRepository {
  findByEmailNormalized(
    emailNormalized: string,
  ): Promise<IdentityRegisteredUserAuthRecord | null>

  /** Perfil sin secretos para `/auth/me` y rutas autenticadas. */
  findProfileByUserPublicId(
    userPublicId: string,
  ): Promise<AuthenticatedUserProfile | null>

  /** Lectura para actualización de perfil (hash solo en servidor). */
  findCredentialByUserPublicId(
    userPublicId: string,
  ): Promise<IdentityRegisteredUserCredentialRecord | null>

  /** Aplica solo las claves presentes en `updates`. */
  applyProfileUpdates(
    userPublicId: string,
    updates: { fullName?: string; passwordHash?: string },
  ): Promise<boolean>

  getPreferredActiveWorkspacePublicId(userPublicId: string): Promise<string | null>
  setPreferredActiveWorkspacePublicId(
    userPublicId: string,
    workspacePublicId: string | null,
  ): Promise<boolean>
}
