import type { AuthMeWorkspaceContext, AuthMeWorkspaceOwnerMembershipContext } from "./auth-me-workspace-context.dto.js"

export type AuthMeWorkspaceListItem = {
  workspacePublicId: string
  workspaceCode: string
  workspaceDisplayName: string
  membership: AuthMeWorkspaceOwnerMembershipContext
  utilizableForOperations: boolean
  billingRestricted: boolean
}

export type AuthMeWorkspaceAccessSummary = {
  preferredActiveWorkspacePublicId: string | null
  requiresWorkspaceSelection: boolean
  noWorkspacesUtilizable: boolean
  /** Sin filas en `WorkspaceMember` para esta cuenta. */
  noWorkspaceOwnerMemberships: boolean
  previousActiveWorkspaceInvalidated: boolean
}

/** Contexto extendido para GET /v1/auth/me (multi-workspace WMI v1). */
export type AuthMeAccessContext = {
  workspace: AuthMeWorkspaceContext | null
  workspaces: AuthMeWorkspaceListItem[]
  workspaceAccess: AuthMeWorkspaceAccessSummary
}
