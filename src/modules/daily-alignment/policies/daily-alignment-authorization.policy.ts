import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { DailyAlignmentForbiddenError } from "../domain/daily-alignment.errors.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"

export function assertCanAccessDailyAlignmentRead(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
}

export function assertCanUpsertOwnDailyParticipant(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
  if (actor.status === "deactivated") {
    throw new DailyAlignmentForbiddenError("Deactivated members cannot save daily alignment updates.")
  }
}

/**
 * Cierre de sesión: Scrum Master, agility lead u operadores (alineado a faciltación operativa).
 */
export function assertCanCloseDailyAlignmentSession(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new DailyAlignmentForbiddenError("Deactivated members cannot close daily alignment sessions.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master") {
    return
  }

  throw new DailyAlignmentForbiddenError(
    "Only Scrum Master, agility lead, admin, or operator may close daily alignment.",
  )
}
