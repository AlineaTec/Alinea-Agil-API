import type { PlatformTenantStatus } from "./platform-tenant-status.js"

/**
 * Fila explícita plataforma ↔ workspace (1:1 v1).
 * No sustituye al documento `Workspace` del cliente.
 */
export type PlatformTenantState = {
  platformTenantId: string
  workspacePublicId: string
  status: PlatformTenantStatus
  createdAt: Date
  updatedAt: Date
}
