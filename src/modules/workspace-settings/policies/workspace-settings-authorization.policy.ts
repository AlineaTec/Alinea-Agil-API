import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

export class WorkspaceSettingsForbiddenError extends Error {
  readonly code = "workspace_settings_forbidden"

  constructor(message: string) {
    super(message)
    this.name = "WorkspaceSettingsForbiddenError"
  }
}

/**
 * Lectura de configuración básica del workspace (web cliente).
 * Alineado a workspace-roles: solo miembros con rol **administrativo** (`admin` | `operator` | `auditor`).
 * Miembros solo metodológicos →403. Desactivados → 403.
 */
export function assertWorkspaceSettingsReadAuthorized(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new WorkspaceSettingsForbiddenError(
      "Deactivated members cannot view workspace settings.",
    )
  }

  if (actor.workspaceRoleAdministrative === null) {
    throw new WorkspaceSettingsForbiddenError(
      "A workspace administrative role is required (admin, operator, or auditor).",
    )
  }

  const ar = actor.workspaceRoleAdministrative
  if (ar === "admin" || ar === "operator" || ar === "auditor") {
    return
  }

  throw new WorkspaceSettingsForbiddenError("Unknown administrative role.")
}

/**
 * Mutación: solo **`admin`** puede cambiar el nombre visible del workspace.
 * `operator` / `auditor` / solo metodológico / desactivado → 403.
 */
export function assertWorkspaceSettingsDisplayNameWriteAuthorized(
  actor: WorkspaceMemberState,
): void {
  if (actor.status === "deactivated") {
    throw new WorkspaceSettingsForbiddenError(
      "Deactivated members cannot update workspace settings.",
    )
  }
  if (actor.workspaceRoleAdministrative !== "admin") {
    throw new WorkspaceSettingsForbiddenError(
      "Only the workspace administrator can change the workspace display name.",
    )
  }
}
