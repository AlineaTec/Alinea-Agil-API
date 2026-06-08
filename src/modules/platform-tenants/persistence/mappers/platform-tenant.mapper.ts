import type { PlatformTenantState } from "../../domain/platform-tenant.entity.js"
import type { PlatformTenantDocProps } from "../schemas/platform-tenant.schema.js"

export type PlatformTenantLeanDoc = PlatformTenantDocProps & {
  createdAt: Date
  updatedAt: Date
}

export function platformTenantDocToState(doc: PlatformTenantLeanDoc): PlatformTenantState {
  return {
    platformTenantId: doc.platformTenantId,
    workspacePublicId: doc.workspacePublicId,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
