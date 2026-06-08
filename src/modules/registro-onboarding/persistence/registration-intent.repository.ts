import type {
  CreateIdentityRegistrationIntentInput,
  IdentityRegistrationIntent,
  UpdateIdentityRegistrationIntentPatch,
} from "../domain/registration-intent.entity.js"

/**
 * Puerto de persistencia del intento de registro.
 * Implementación concreta: `prisma/registration-intent.prisma-repository.ts`.
 */
export interface IdentityRegistrationIntentRepository {
  create(input: CreateIdentityRegistrationIntentInput): Promise<IdentityRegistrationIntent>
  findByPublicId(intentPublicId: string): Promise<IdentityRegistrationIntent | null>
  /** TODO [P]: definir «activo» vs histórico según negocio. */
  findLatestByEmailNormalized(
    emailNormalized: string,
  ): Promise<IdentityRegistrationIntent | null>
  updateByPublicId(
    intentPublicId: string,
    patch: UpdateIdentityRegistrationIntentPatch,
    opts?: { unset?: string[] },
  ): Promise<IdentityRegistrationIntent | null>

  /**
   * Intento no caducado que ya reclama este código normalizado (Fase D, pre-check).
   * No incluye estados previos a `WORKSPACE_PROPOSED`.
   */
  findClaimingWorkspaceCode(
    normalizedCode: string,
    asOf: Date,
  ): Promise<IdentityRegistrationIntent | null>
}
