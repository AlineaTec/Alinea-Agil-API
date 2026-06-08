import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectDraftForbiddenError } from "../domain/project-draft.errors.js"

/**
 * Autorización mínima para mutar project drafts (wizard).
 * admin | operator | agility_lead.
 */
export function assertCanMutateProjectDraft(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProjectDraftForbiddenError("Deactivated members cannot mutate project drafts.")
  }

  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological

  if (ar === "admin" || ar === "operator") {
    return
  }

  if (mr === "agility_lead") {
    return
  }

  throw new ProjectDraftForbiddenError(
    "Only admin, operator, or agility_lead may create or mutate project drafts.",
  )
}

/**
 * Fase HTTP preliminar: **misma** política que `assertCanMutateProjectDraft` para GET y POST.
 * Contrato a largo plazo (p. ej. `auditor` solo lectura en listados) se puede aplicar aquí sin tocar el servicio de dominio.
 */
export function assertCanAccessProjectDraftWizardPreliminary(actor: WorkspaceMemberState): void {
  assertCanMutateProjectDraft(actor)
}
