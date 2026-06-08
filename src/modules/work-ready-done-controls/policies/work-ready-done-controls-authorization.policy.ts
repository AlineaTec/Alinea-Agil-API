import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { WorkControlsForbiddenError } from "../domain/work-ready-done-controls.errors.js"

function assertActiveMember(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated" || actor.status === "pending") {
    throw new WorkControlsForbiddenError("Deactivated or pending members cannot use work controls.", "work_controls_deactivated")
  }
}

/**
 * v1: lectura de definiciones, plantilla, evaluación, auditoría (sin datos sensibles en payload de dominio work-controls).
 * Excluido: miembros sin acceso a proyecto a nivel HTTP (cubierto por membership).
 */
export function assertCanReadWorkControls(actor: WorkspaceMemberState): void {
  assertActiveMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") return
  if (
    mr &&
    [
      "agility_lead",
      "scrum_master",
      "product_owner",
      "scrum_coach",
      "scrum_developer",
    ].includes(mr)
  ) {
    return
  }
  throw new WorkControlsForbiddenError("You do not have permission to read work controls (DoR/DoD).", "work_controls_read_forbidden")
}

/** Plantilla de workspace o perfil de proyecto. */
export function assertCanManageWorkControls(actor: WorkspaceMemberState): void {
  assertCanReadWorkControls(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return
  if (mr && ["agility_lead", "scrum_master", "product_owner"].includes(mr)) return
  throw new WorkControlsForbiddenError("You do not have permission to manage work controls configuration.", "work_controls_manage_forbidden")
}

/** On-demand: vista de faltas/criterios para el ítem. */
export function assertCanEvaluateWorkControls(actor: WorkspaceMemberState): void {
  assertCanReadWorkControls(actor)
}

/**
 * Emisión de token de override (pasa a header en transiciones reales). No masivo, un ítem+evento.
 * Excluidos explícitamente: scrum_developer, scrum_coach, auditor.
 */
const OVERRIDE_ALLOWED_MR = new Set<string>(["agility_lead", "scrum_master", "product_owner"])
const OVERRIDE_ALLOWED_AR = new Set<string>(["admin", "operator"])

export function assertCanIssueWorkControlsOverride(actor: WorkspaceMemberState): void {
  assertActiveMember(actor)
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar && OVERRIDE_ALLOWED_AR.has(ar)) return
  if (mr && OVERRIDE_ALLOWED_MR.has(mr)) return
  throw new WorkControlsForbiddenError(
    "This role cannot issue work control overrides in v1.",
    "work_controls_override_forbidden",
  )
}
