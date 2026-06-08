import type { IdentityUser } from "@prisma/client"
import { normalizeWorkspaceModality } from "../../../registro-onboarding/domain/workspace-modality.js"
import type { AuthenticatedUserProfile } from "../../domain/authenticated-user-profile.entity.js"
import type {
  IdentityRegisteredUserAuthRecord,
  IdentityRegisteredUserCredentialRecord,
} from "../identity-registered-user-for-auth.repository.js"

export type CreateIdentityUserPersistenceInput = {
  publicId: string
  emailNormalized: string
  fullName: string
  passwordHash: string
  modalityAtSignup: string
  sourceRegistrationIntentPublicId: string
}

export function toIdentityRegisteredUserAuthRecord(
  row: Pick<IdentityUser, "public_id" | "email_normalized" | "password_hash">,
): IdentityRegisteredUserAuthRecord {
  return {
    userPublicId: row.public_id,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
  }
}

export function toAuthenticatedUserProfile(
  row: Pick<IdentityUser, "public_id" | "email_normalized" | "full_name" | "modality_at_signup">,
): AuthenticatedUserProfile {
  const modality = normalizeWorkspaceModality(row.modality_at_signup) ?? "individual"
  return {
    userPublicId: row.public_id,
    emailNormalized: row.email_normalized,
    fullName: row.full_name,
    modalityAtSignup: modality,
  }
}

export function toIdentityRegisteredUserCredentialRecord(
  row: Pick<IdentityUser, "public_id" | "full_name" | "password_hash">,
): IdentityRegisteredUserCredentialRecord {
  return {
    userPublicId: row.public_id,
    fullName: row.full_name,
    passwordHash: row.password_hash,
  }
}
