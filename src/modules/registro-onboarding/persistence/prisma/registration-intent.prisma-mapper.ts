import type { IdentityRegistrationIntent as IdentityRegistrationIntentRow } from "@prisma/client"
import { normalizeStoredBillingCadence } from "../../../commercial-pricing/billing-cadence.js"
import type { IdentityRegistrationIntent } from "../../domain/registration-intent.entity.js"
import type { IdentityRegistrationIntentPersisted } from "../mappers/registration-intent.mapper.js"
import { toIdentityRegistrationIntent } from "../mappers/registration-intent.mapper.js"

export function identityRegistrationIntentRowToPersisted(
  row: IdentityRegistrationIntentRow,
): IdentityRegistrationIntentPersisted {
  return {
    intentPublicId: row.public_id,
    emailNormalized: row.email_normalized,
    status: row.status,
    modality: (row.modality ?? undefined) as IdentityRegistrationIntentPersisted["modality"],
    workspaceDisplayName: row.workspace_display_name ?? undefined,
    workspaceCode: row.workspace_code ?? undefined,
    accountFullName: row.account_full_name ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    planSku: row.plan_sku ?? undefined,
    billingCadence: normalizeStoredBillingCadence(row.billing_cadence ?? undefined),
    teamSeatsPurchased: row.team_seats_purchased ?? undefined,
    paymentProviderRef: row.payment_provider_ref ?? undefined,
    provisionedUserPublicId: row.provisioned_user_public_id ?? undefined,
    provisionedWorkspacePublicId: row.provisioned_workspace_public_id ?? undefined,
    provisionedAt: row.provisioned_at ?? undefined,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function identityRegistrationIntentFromPrisma(
  row: IdentityRegistrationIntentRow,
): IdentityRegistrationIntent {
  return toIdentityRegistrationIntent(identityRegistrationIntentRowToPersisted(row))
}

export function registrationIntentPatchToPrismaData(
  patch: Partial<
    Omit<IdentityRegistrationIntent, "intentPublicId" | "createdAt" | "updatedAt">
  >,
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (patch.emailNormalized !== undefined) data.email_normalized = patch.emailNormalized
  if (patch.status !== undefined) data.status = patch.status
  if (patch.modality !== undefined) data.modality = patch.modality
  if (patch.workspaceDisplayName !== undefined) {
    data.workspace_display_name = patch.workspaceDisplayName
  }
  if (patch.workspaceCode !== undefined) data.workspace_code = patch.workspaceCode
  if (patch.accountFullName !== undefined) data.account_full_name = patch.accountFullName
  if (patch.passwordHash !== undefined) data.password_hash = patch.passwordHash
  if (patch.planSku !== undefined) data.plan_sku = patch.planSku
  if (patch.billingCadence !== undefined) data.billing_cadence = patch.billingCadence
  if (patch.teamSeatsPurchased !== undefined) data.team_seats_purchased = patch.teamSeatsPurchased
  if (patch.paymentProviderRef !== undefined) data.payment_provider_ref = patch.paymentProviderRef
  if (patch.provisionedUserPublicId !== undefined) {
    data.provisioned_user_public_id = patch.provisionedUserPublicId
  }
  if (patch.provisionedWorkspacePublicId !== undefined) {
    data.provisioned_workspace_public_id = patch.provisionedWorkspacePublicId
  }
  if (patch.provisionedAt !== undefined) data.provisioned_at = patch.provisionedAt
  if (patch.metadata !== undefined) data.metadata = patch.metadata
  if (patch.expiresAt !== undefined) data.expires_at = patch.expiresAt
  return data
}

/** Campos de dominio → columnas Prisma para campos anulados en parches. */
export function registrationIntentUnsetKeysToNull(
  unset: string[],
): Record<string, null> {
  const map: Record<string, null> = {}
  for (const key of unset) {
    if (key === "teamSeatsPurchased") map.team_seats_purchased = null
  }
  return map
}
