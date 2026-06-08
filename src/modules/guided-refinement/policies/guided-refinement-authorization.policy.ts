import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { GuidedRefinementForbiddenError } from "../domain/guided-refinement.errors.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"

export function assertCanAccessGuidedRefinementRead(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
}

/**
 * Revisión de ítems: mismo universo que lectura de backlog compartido (Scrum/Kanban).
 */
export function assertCanUpsertGuidedRefinementReview(actor: WorkspaceMemberState): void {
  assertCanReadScrumBacklog(actor)
}

/**
 * Cierre: facilitador operativo o PO como facilitador (OQ-GRF-6).
 */
export function assertCanCloseGuidedRefinementSession(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new GuidedRefinementForbiddenError("Deactivated members cannot close guided refinement sessions.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") {
    return
  }

  throw new GuidedRefinementForbiddenError(
    "Only facilitator roles (Scrum Master, agility lead, product owner), admin, or operator may close guided refinement.",
  )
}
