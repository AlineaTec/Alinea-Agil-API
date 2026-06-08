import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ScrumBacklogForbiddenError } from "../domain/scrum-backlog.errors.js"

/**
 * Lectura de backlog Scrum (listados, GET ítem, carryover en JSON).
 * Incluye roles de equipo Scrum con lectura de tablero (SM, PO, developer) y coach/auditor/agility_lead.
 */
export function assertCanReadScrumBacklog(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ScrumBacklogForbiddenError("Deactivated members cannot access the Scrum backlog.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (ar === "auditor") {
    return
  }

  if (
    mr === "agility_lead" ||
    mr === "scrum_coach" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return
  }

  throw new ScrumBacklogForbiddenError(
    "Your workspace role does not allow read access to the Scrum backlog.",
  )
}

/**
 * Crear, actualizar, reordenar o borrar ítems de backlog.
 * Conservador: solo `admin`, `operator`, `agility_lead` (sin SM/PO/dev/auditor/coach).
 */
export function assertCanMutateScrumBacklog(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ScrumBacklogForbiddenError("Deactivated members cannot change the Scrum backlog.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead") {
    return
  }

  throw new ScrumBacklogForbiddenError(
    "Only admin, operator, or agility_lead may change the Scrum backlog in this phase.",
  )
}
