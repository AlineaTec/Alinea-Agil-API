import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { GuidedSprintPlanningForbiddenError } from "../domain/guided-sprint-planning.errors.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"

export function assertCanAccessGuidedSprintPlanningRead(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
}

/** Decisiones por ítem: mismo universo que lectura/contribución al backlog (OQ-GPLAN-3). */
export function assertCanUpsertGuidedSprintPlanningDecision(actor: WorkspaceMemberState): void {
  assertCanReadScrumBacklog(actor)
}

/** Cierre: facilitador operativo o PO como facilitador (OQ-GPLAN-3). */
export function assertCanCloseGuidedSprintPlanningSession(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new GuidedSprintPlanningForbiddenError(
      "Deactivated members cannot close guided sprint planning sessions.",
    )
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") {
    return
  }

  throw new GuidedSprintPlanningForbiddenError(
    "Only facilitator roles (Scrum Master, agility lead, product owner), admin, or operator may close guided sprint planning.",
  )
}
