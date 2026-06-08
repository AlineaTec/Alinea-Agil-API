import type { MethodologyContext } from "../../team-operational-metrics/domain/team-operational-metrics.dto.js"

/** Misma unión de enfoque que team-operational-metrics. */
export type { MethodologyContext }

export type FlowMetricsPeriod = {
  /** p.ej. `rolling_7d_utc@default` o `custom` */
  kind: "rolling_7d_utc" | "custom"
  label: string
  from: string
  to: string
}

/**
 * v1: sin score único, sin forecast; señal analítica y honesta sobre datos.
 */
export type TeamFlowDeliverySummaryJson = {
  teamPublicId: string
  teamName: string
  teamStatus: string
  teamLeadUserPublicId: string | null
  linkedProjectsCount: number
  linkedProjectPublicIds: string[]
  methodologyContext: MethodologyContext
  period: FlowMetricsPeriod
  /**
   * Trabajo terminado (ítems de carga, no épicas) cuyo `status === "done"`
   * y cuyo `updatedAt` cae en `period` [from,to]. Proxy de cierre: ver `calculationNotes` + warning `THROUGHPUT_USES_ITEM_UPDATED_AT`.
   */
  throughputLastPeriod: number
  /**
   * Ratio 0–1 de **arrastre al cierre** del **último sprint cerrado** por proyecto Scrum vinculado: `notCompletedItemsCount / committedItemsCount` en snapshot de cierre. Valor de equipo = media simple de los proyectos con dato. `null` sin sprint cerrado o sin proyectos Scrum.
   */
  carryOverRate: number | null
  /**
   * Ítems activos (no épicas, open|in_progress) con `ageDays > FLOW_AGING_STALE_DAYS` desde `createdAt`.
   */
  oldActiveWorkItemsCount: number
  unassignedWorkItemsCount: number
  /** En snapshot actual: open|in_progress|in_review si existiera, non-epic, isBlocked. Kanban: tarjeta bloqueada; Scrum backlog: 0. */
  blockedWorkItemsInFlowCount: number
  /**
   * v1: duración agregada de bloqueo no modelada; `null` salvo extensión futura con historial. Ver `dataQualityWarnings`.
   */
  averageBlockedTimeDays: null
  /**
   * Días (decimal) de creación a **primera** asignación a persona; media sobre ítems con al menos un evento de asignación. `null` sin capability o insuficiencia.
   */
  averageTimeToFirstAssignmentDays: number | null
  /**
   * Eventos de historial cuya `changedAt` ∈ periodo (cambio de asignatario, incl. a/desde null según repositorio). `null` si capability restringe.
   */
  reassignmentEventCountInPeriod: number | null
  flowFrictionSignalCodes: string[]
  hasSufficientData: boolean
  dataQualityWarnings: string[]
  calculationNotes: string[]
}

export type TeamFlowDeliveryListRowJson = TeamFlowDeliverySummaryJson & {
  sortKey?: string
}

export type ListTeamFlowDeliveryResultJson = {
  items: TeamFlowDeliveryListRowJson[]
  totalCount: number
  limit: number
  offset: number
  methodologyContextWorkspace: MethodologyContext
  dataQualityWarnings: string[]
  calculationNotes: string[]
}
