import type { Workspace } from "@prisma/client"
import { normalizeWorkspaceModality } from "../../domain/workspace-modality.js"
import type { CreateWorkspaceInput, WorkspaceState } from "../workspace.repository.js"

export function workspaceFromPrisma(row: Workspace): WorkspaceState {
  return {
    workspacePublicId: row.public_id,
    slug: row.slug,
    displayName: row.display_name,
    modality: normalizeWorkspaceModality(row.modality) ?? "individual",
    billingCadence: row.billing_cadence ?? undefined,
    sourceRegistrationIntentPublicId: row.source_registration_intent_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createWorkspaceToPrisma(input: CreateWorkspaceInput) {
  return {
    public_id: input.workspacePublicId,
    slug: input.slug,
    display_name: input.displayName,
    modality: input.modality,
    billing_cadence: input.billingCadence ?? null,
    source_registration_intent_public_id: input.sourceRegistrationIntentPublicId,
  }
}
