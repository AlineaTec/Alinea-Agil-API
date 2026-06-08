import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { GuidedReviewForbiddenError } from "../domain/guided-review.errors.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"

export function assertCanAccessGuidedReviewRead(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
}

/** Demostraciones y feedback: mismo universo que lectura/contribución de backlog compartido. */
export function assertCanUpsertGuidedReviewContent(actor: WorkspaceMemberState): void {
  assertCanReadScrumBacklog(actor)
}

/** Cierre / nota aditiva: facilitador operativo o PO (OQ-GREV-5, alineado a Guided Refinement). */
export function assertCanCloseGuidedReviewSession(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new GuidedReviewForbiddenError("Deactivated members cannot close guided review sessions.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") {
    return
  }

  throw new GuidedReviewForbiddenError(
    "Only facilitator roles (Scrum Master, agility lead, product owner), admin, or operator may close guided review.",
  )
}
