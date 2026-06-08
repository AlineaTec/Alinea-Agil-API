import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { KANBAN_CAPABILITY, type KanbanCapability } from "../domain/kanban-capability.js"

/**
 * Evaluación pura rol × capacidad Kanban v1.
 * Los nombres de rol son los de `workspace-roles` (deuda: semántica Scrum-centric en proyectos solo Kanban — ver README).
 */
export function kanbanMemberHasCapability(actor: WorkspaceMemberState, capability: KanbanCapability): boolean {
  switch (capability) {
    case KANBAN_CAPABILITY.BACKLOG_READ:
      return kanbanMemberHasBacklogRead(actor)
    case KANBAN_CAPABILITY.BACKLOG_EDIT:
      return kanbanMemberHasBacklogEdit(actor)
    case KANBAN_CAPABILITY.BACKLOG_RANK:
      return kanbanMemberHasBacklogRank(actor)
    case KANBAN_CAPABILITY.RELEASE_TO_FLOW:
      return kanbanMemberHasReleaseToFlow(actor)
    case KANBAN_CAPABILITY.BOARD_READ:
      return kanbanMemberHasBoardRead(actor)
    case KANBAN_CAPABILITY.BOARD_MOVE:
      return kanbanMemberHasBoardMove(actor)
    case KANBAN_CAPABILITY.BOARD_RETURN_TO_BACKLOG:
      return kanbanMemberHasBoardReturnToBacklog(actor)
    case KANBAN_CAPABILITY.BOARD_BLOCK:
      return kanbanMemberHasBoardBlock(actor)
    case KANBAN_CAPABILITY.FLOW_CONFIGURE:
      return kanbanMemberHasFlowConfigure(actor)
    case KANBAN_CAPABILITY.EVENTS_READ:
      return kanbanMemberHasEventsRead(actor)
    case KANBAN_CAPABILITY.METRICS_READ:
      return kanbanMemberHasMetricsRead(actor)
    case KANBAN_CAPABILITY.REPORTS_READ:
      return kanbanMemberHasReportsRead(actor)
    case KANBAN_CAPABILITY.WIP_READ:
      return kanbanMemberHasWipRead(actor)
    case KANBAN_CAPABILITY.WIP_MANAGE:
      return kanbanMemberHasWipManage(actor)
    case KANBAN_CAPABILITY.WIP_OVERRIDE:
      return kanbanMemberHasWipOverride(actor)
    case KANBAN_CAPABILITY.FLOW_TIME_READ:
      return kanbanMemberHasFlowTimeRead(actor)
    case KANBAN_CAPABILITY.FLOW_TIME_DETAIL_READ:
      return kanbanMemberHasFlowTimeDetailRead(actor)
    default: {
      const _exhaustive: never = capability
      return _exhaustive
    }
  }
}

export function kanbanMemberHasBacklogRead(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator" || ar === "auditor") return true
  if (
    mr === "agility_lead" ||
    mr === "scrum_coach" ||
    mr === "product_owner" ||
    mr === "scrum_master" ||
    mr === "scrum_developer"
  ) {
    return true
  }
  return false
}

/** Crear/editar ítems en backlog (sin liberar ni reordenar por esta capacidad sola). */
export function kanbanMemberHasBacklogEdit(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (
    mr === "agility_lead" ||
    mr === "product_owner" ||
    mr === "scrum_master" ||
    mr === "scrum_developer"
  ) {
    return true
  }
  return false
}

/** Familia priorización: reordenar backlog lista. */
export function kanbanMemberHasBacklogRank(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasCoordinatingBacklogBoundary(actor)
}

/** Liberar a columna de entrada del flujo. */
export function kanbanMemberHasReleaseToFlow(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasCoordinatingBacklogBoundary(actor)
}

function kanbanMemberHasCoordinatingBacklogBoundary(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (mr === "agility_lead" || mr === "product_owner" || mr === "scrum_master") {
    return true
  }
  return false
}

/** Retorno al backlog: misma frontera efectiva que liberar (PKP-05). */
export function kanbanMemberHasBoardReturnToBacklog(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasCoordinatingBacklogBoundary(actor)
}

export function kanbanMemberHasBoardRead(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (ar === "auditor") return true
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer" ||
    mr === "scrum_coach"
  ) {
    return true
  }
  return false
}

export function kanbanMemberHasBoardMove(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer"
  ) {
    return true
  }
  return false
}

/** v1: misma matriz efectiva que `board.move` (PKP matriz). */
export function kanbanMemberHasBoardBlock(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasBoardMove(actor)
}

/**
 * Columnas, WIP, policyText, entryColumnId.
 * v1 conservador: solo `admin` y `operator` (PO/SM/AL son [P] en contracts; no concedidos aquí).
 */
export function kanbanMemberHasFlowConfigure(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  return ar === "admin" || ar === "operator"
}

/** Histórico / timeline de flujo cuando exista API; v1 misma amplitud que lectura de backlog lista. */
export function kanbanMemberHasEventsRead(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasBacklogRead(actor)
}

export function kanbanMemberHasMetricsRead(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (ar === "auditor") return true
  if (
    mr === "agility_lead" ||
    mr === "scrum_master" ||
    mr === "product_owner" ||
    mr === "scrum_developer" ||
    mr === "scrum_coach"
  ) {
    return true
  }
  return false
}

/** Alineado a `kanban.metrics.read` / `flow-time.read`. */
export function kanbanMemberHasFlowTimeRead(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasMetricsRead(actor)
}

/**
 * Detalle con títulos: misma base que métricas; **auditor** no recibe títulos en detalle v1.
 * (semántica `flow-time.detail.read`.)
 */
export function kanbanMemberHasFlowTimeDetailRead(actor: WorkspaceMemberState): boolean {
  if (!kanbanMemberHasMetricsRead(actor)) return false
  if (actor.workspaceRoleAdministrative === "auditor") return false
  return true
}

/**
 * Concepto separado de métricas; v1 misma política efectiva que `metrics.read` sin fusionar el nombre.
 */
export function kanbanMemberHasReportsRead(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasMetricsRead(actor)
}

/** v1: misma amplitud que `kanban.board.read`. */
export function kanbanMemberHasWipRead(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasBoardRead(actor)
}

/**
 * Configurar límites/políticas WIP: admin, operator, agility_lead, scrum_master.
 */
export function kanbanMemberHasWipManage(actor: WorkspaceMemberState): boolean {
  return kanbanMemberHasWipOverride(actor)
}

/** Override al mover bajo `blocking` (misma frontera que `manage` en v1). */
export function kanbanMemberHasWipOverride(actor: WorkspaceMemberState): boolean {
  const ar = actor.workspaceRoleAdministrative
  const mr = actor.workspaceRoleMethodological
  if (ar === "admin" || ar === "operator") return true
  if (mr === "agility_lead" || mr === "scrum_master") return true
  return false
}
