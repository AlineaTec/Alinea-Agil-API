import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "../domain/workspace-member-roles.js"
import type { WorkspaceMemberStatus } from "../domain/workspace-member-status.js"

/**
 * Subconjunto de `WorkspaceMember` expuesto en GET /v1/auth/me (sin PII extra del listado).
 */
export type AuthMeWorkspaceOwnerMembershipContext = {
  membershipPublicId: string
  status: WorkspaceMemberStatus
  workspaceRoleAdministrative: WorkspaceAdministrativeRole | null
  workspaceRoleMethodological: WorkspaceMethodologicalRole | null
}

/**
 * Workspace “activo” del usuario autenticado para el cliente (un solo contexto; sin selector multi-tenant).
 */
export type AuthMeWorkspaceContext = {
  workspacePublicId: string
  /** Alineado al campo `code` del documento `Workspace` (slug único). */
  workspaceCode: string
  workspaceDisplayName: string
  membership: AuthMeWorkspaceOwnerMembershipContext
}
