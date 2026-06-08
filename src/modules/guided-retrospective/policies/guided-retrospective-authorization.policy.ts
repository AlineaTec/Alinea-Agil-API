import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { GuidedRetrospectiveForbiddenError } from "../domain/guided-retrospective.errors.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { assertCanReadScrumBacklog } from "../../project-scrum-backlog/policies/scrum-backlog-authorization.policy.js"

/** Roles que pueden facilitar retrospectiva (alineado con assertCanFacilitateGuidedRetrospective). */
export function isFacilitatorClassForGuidedRetrospective(actor: WorkspaceMemberState): boolean {
  if (actor.status === "deactivated") return false
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") return true
  return false
}

/** Quién puede editar una acción de retrospectiva ya persistida (facilitador amplio; responsable acotado). */
export function resolveRetroActionItemPatchMode(
  actor: WorkspaceMemberState,
  ownerUserPublicId: string | null,
): "facilitator" | "assignee" | null {
  if (actor.status === "deactivated") return null
  if (isFacilitatorClassForGuidedRetrospective(actor)) return "facilitator"
  if (ownerUserPublicId != null && ownerUserPublicId === actor.userPublicId) return "assignee"
  return null
}

export function assertCanAccessGuidedRetrospectiveRead(actor: WorkspaceMemberState): void {
  assertCanReadProjectRuntime(actor)
}

/** Aportes y votos: mismo universo que contribución de backlog compartida (alineación review/refinement). */
export function assertCanParticipateGuidedRetrospective(actor: WorkspaceMemberState): void {
  assertCanReadScrumBacklog(actor)
}

/** Facilitación: consolidar temas, cambiar fase, cerrar — roles operativos (OQ-GRETRO-20). */
export function assertCanFacilitateGuidedRetrospective(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new GuidedRetrospectiveForbiddenError("Deactivated members cannot facilitate guided retrospectives.")
  }
  if (isFacilitatorClassForGuidedRetrospective(actor)) return
  throw new GuidedRetrospectiveForbiddenError(
    "Only facilitator roles (Scrum Master, agility lead, product owner), admin, or operator may facilitate this retrospective.",
  )
}

/** Cierre y nota aditiva — mismos roles que facilitación en v1. */
export function assertCanCloseGuidedRetrospectiveSession(actor: WorkspaceMemberState): void {
  assertCanFacilitateGuidedRetrospective(actor)
}
