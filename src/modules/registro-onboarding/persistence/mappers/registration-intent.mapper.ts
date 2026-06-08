import type { IdentityRegistrationIntent } from "../../domain/registration-intent.entity.js"
import { normalizeWorkspaceModality } from "../../domain/workspace-modality.js"
import type { IdentityRegistrationIntentDocProps } from "../schemas/identity-registration-intent.schema.js"

/** Objeto persistido con timestamps. */
export type IdentityRegistrationIntentPersisted = IdentityRegistrationIntentDocProps & {
  createdAt: Date
  updatedAt: Date
}

export function toIdentityRegistrationIntent(
  doc: IdentityRegistrationIntentPersisted,
): IdentityRegistrationIntent {
  const rawMod = doc.modality
  const modality =
    rawMod !== undefined && rawMod !== null
      ? normalizeWorkspaceModality(rawMod)
      : undefined

  return {
    intentPublicId: doc.intentPublicId,
    emailNormalized: doc.emailNormalized,
    status: doc.status,
    modality,
    workspaceDisplayName: doc.workspaceDisplayName,
    workspaceCode: doc.workspaceCode,
    accountFullName: doc.accountFullName,
    passwordHash: doc.passwordHash,
    planSku: doc.planSku,
    billingCadence: doc.billingCadence,
    teamSeatsPurchased: doc.teamSeatsPurchased,
    paymentProviderRef: doc.paymentProviderRef,
    provisionedUserPublicId: doc.provisionedUserPublicId,
    provisionedWorkspacePublicId: doc.provisionedWorkspacePublicId,
    provisionedAt: doc.provisionedAt,
    metadata: doc.metadata,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
