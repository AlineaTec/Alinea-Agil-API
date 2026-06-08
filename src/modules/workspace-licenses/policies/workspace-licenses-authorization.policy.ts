import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

export type WorkspaceLicensesAction = "view_summary" | "mutate_license"

export class WorkspaceLicensesForbiddenError extends Error {
  readonly code = "workspace_licenses_forbidden"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceLicensesForbiddenError"
  }
}

/**
 * Autorización mínima workspace-licenses (workspace-roles).
 * Misma línea base que workspace-users: solo rol **administrativo**; miembros solo metodológicos → 403.
 * - admin / operator: lectura y mutaciones actuales del módulo.
 * - auditor: solo GET summary.
 */
export function assertWorkspaceLicensesAuthorized(options: {
  actor: WorkspaceMemberState
  action: WorkspaceLicensesAction
}): void {
  const { actor, action } = options

  if (actor.status === "deactivated") {
    throw new WorkspaceLicensesForbiddenError(
      "Deactivated members cannot access workspace license administration.",
    )
  }

  if (actor.workspaceRoleAdministrative === null) {
    throw new WorkspaceLicensesForbiddenError(
      "A workspace administrative role is required (admin, operator, or auditor).",
    )
  }

  const ar = actor.workspaceRoleAdministrative

  if (ar === "auditor") {
    if (action !== "view_summary") {
      throw new WorkspaceLicensesForbiddenError(
        "Auditor role may only view the license summary.",
      )
    }
    return
  }

  if (ar === "admin" || ar === "operator") {
    return
  }

  throw new WorkspaceLicensesForbiddenError("Unknown administrative role.")
}
