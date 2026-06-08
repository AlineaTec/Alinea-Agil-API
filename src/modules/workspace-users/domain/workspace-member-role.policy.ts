import type { WorkspaceAdministrativeRole, WorkspaceMethodologicalRole } from "./workspace-member-roles.js"
import { WorkspaceUserInvariantError } from "./workspace-user.errors.js"

/** Exactamente uno de los dos catálogos XOR (nunca ambos, nunca ninguno). */
export function assertWorkspaceRoleXor(
  administrative: WorkspaceAdministrativeRole | null,
  methodological: WorkspaceMethodologicalRole | null,
): void {
  const a = administrative !== null
  const m = methodological !== null
  if (a === m) {
    throw new WorkspaceUserInvariantError(
      "workspace member must have exactly one role: administrative XOR methodological",
    )
  }
}
