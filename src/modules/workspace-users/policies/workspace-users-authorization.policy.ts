import type { WorkspaceMemberState } from "../domain/workspace-member.js"

export type WorkspaceUsersRouteAction =
  | "list_members"
  | "create_member"
  | "manage_workspace_invitations"
  | "activate_member"
  | "deactivate_member"
  | "delete_member"
  | "assign_seat"
  | "release_seat"
  | "update_roles"

export class WorkspaceUsersForbiddenError extends Error {
  readonly code = "workspace_users_forbidden"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceUsersForbiddenError"
  }
}

/**
 * Autorización mínima workspace-users alineada a workspace-roles (admin / operator / auditor).
 * Supuesto: el actor tiene rol total XOR; solo quien tiene rol **administrativo** accede a estas rutas
 * (miembros solo metodológicos reciben 403).
 */
export function assertWorkspaceUsersAuthorized(options: {
  actor: WorkspaceMemberState
  action: WorkspaceUsersRouteAction
  /** Obligatorio para `update_roles` (operator). */
  roleUpdateContext?: {
    target: WorkspaceMemberState
    payloadHasAdministrativeRole: boolean
    payloadHasMethodologicalRole: boolean
  }
}): void {
  const { actor, action, roleUpdateContext } = options

  if (actor.status === "deactivated") {
    throw new WorkspaceUsersForbiddenError(
      "Deactivated members cannot access workspace user administration.",
    )
  }

  if (actor.workspaceRoleAdministrative === null) {
    throw new WorkspaceUsersForbiddenError(
      "A workspace administrative role is required (admin, operator, or auditor).",
    )
  }

  const ar = actor.workspaceRoleAdministrative

  if (ar === "auditor") {
    if (action !== "list_members") {
      throw new WorkspaceUsersForbiddenError("Auditor role may only list workspace members.")
    }
    return
  }

  if (ar === "admin") {
    return
  }

  if (ar === "operator") {
    if (action === "create_member") {
      throw new WorkspaceUsersForbiddenError("Operators cannot create workspace members.")
    }
    if (action === "delete_member") {
      throw new WorkspaceUsersForbiddenError("Operators cannot delete workspace members.")
    }
    if (action === "manage_workspace_invitations") {
      return
    }
    if (action === "list_members") {
      return
    }
    if (action === "update_roles") {
      const ru = roleUpdateContext
      if (!ru) {
        throw new WorkspaceUsersForbiddenError("Missing role update context for authorization.")
      }
      if (ru.payloadHasAdministrativeRole) {
        throw new WorkspaceUsersForbiddenError("Operators cannot change administrative roles.")
      }
      if (!ru.payloadHasMethodologicalRole) {
        throw new WorkspaceUsersForbiddenError("Operators may only submit methodological role updates.")
      }
      if (ru.target.workspaceRoleAdministrative !== null) {
        throw new WorkspaceUsersForbiddenError(
          "Operators cannot change roles for members who hold an administrative role.",
        )
      }
      if (ru.target.workspaceRoleMethodological === null) {
        throw new WorkspaceUsersForbiddenError(
          "Operators may only edit members who currently have a methodological role.",
        )
      }
      return
    }
    return
  }

  throw new WorkspaceUsersForbiddenError("Unknown administrative role.")
}
