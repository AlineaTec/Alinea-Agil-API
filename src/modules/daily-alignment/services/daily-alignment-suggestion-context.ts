import type { WorkspaceAuditLogCategory } from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkItemTimeEntriesRepository } from "../../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import { auditOccurredAtRangeForReferenceYmd, utcWorkDateRangeForOperationalReferenceYmd } from "../domain/operational-calendar.js"

export const DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES = 30
export const DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS = 2

export type SuggestionBasisPayload = {
  referenceYmd: string
  sessionYmd: string
  operationalTimeZone: string
  insufficientData: boolean
  totalMinutesLogged: number
  relevantAuditEventCount: number
  sourcesUsed: ("time_logs" | "workspace_audit")[]
}

export type ConsistencyHintPayload = {
  kind: string
  explanation: string
  basis: Record<string, unknown>
}

const AUDIT_CATEGORIES_FOR_MOVEMENTS: WorkspaceAuditLogCategory[] = [
  "scrum_sprint_board_item",
  "kanban_board_item",
  "scrum_backlog_item",
  "time_entry",
]

export async function buildSuggestionBasisAndHints(input: {
  workspacePublicId: string
  projectPublicId: string
  userPublicId: string
  sessionYmd: string
  operationalTimeZone: string
  timeEntriesRepository: WorkItemTimeEntriesRepository
  auditLogRepository: WorkspaceAuditLogRepository
  yesterdaySummary: string
  referenceYmd: string
}): Promise<{ basis: SuggestionBasisPayload; hints: ConsistencyHintPayload[]; draftBulletsYesterday: string[] }> {
  const { from, toExclusive } = utcWorkDateRangeForOperationalReferenceYmd(input.referenceYmd)
  const minutes = await input.timeEntriesRepository.sumMinutesForUserProjectWorkDateRange(
    input.workspacePublicId,
    input.projectPublicId,
    input.userPublicId,
    from,
    toExclusive,
  )

  const { from: auditFrom, to: auditTo } = auditOccurredAtRangeForReferenceYmd(input.referenceYmd)
  const eventCount = await input.auditLogRepository.countForProjectUserInWindow({
    workspacePublicId: input.workspacePublicId,
    projectPublicId: input.projectPublicId,
    actorUserPublicId: input.userPublicId,
    occurredAtFrom: auditFrom,
    occurredAtTo: auditTo,
    categories: AUDIT_CATEGORIES_FOR_MOVEMENTS,
  })

  const sourcesUsed: SuggestionBasisPayload["sourcesUsed"] = []
  if (minutes > 0) sourcesUsed.push("time_logs")
  if (eventCount > 0) sourcesUsed.push("workspace_audit")

  const sufficient =
    minutes >= DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES || eventCount >= DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS

  const basis: SuggestionBasisPayload = {
    referenceYmd: input.referenceYmd,
    sessionYmd: input.sessionYmd,
    operationalTimeZone: input.operationalTimeZone,
    insufficientData: !sufficient,
    totalMinutesLogged: minutes,
    relevantAuditEventCount: eventCount,
    sourcesUsed,
  }

  const draftBulletsYesterday: string[] = []
  if (minutes > 0) {
    draftBulletsYesterday.push(
      `Registraste ${minutes} minutos de trabajo registrados en el proyecto el ${input.referenceYmd} (calendario operativo / ventana pragmática v1).`,
    )
  }
  if (eventCount > 0) {
    draftBulletsYesterday.push(
      `Hubo ${eventCount} evento(s) de trabajo registrados (tablero/backlog/tiempos) el ${input.referenceYmd} a nombre tuyo en el proyecto.`,
    )
  }

  const hints: ConsistencyHintPayload[] = []
  if (!sufficient) {
    hints.push({
      kind: "insufficient_observable_activity",
      explanation:
        "No hay suficiente actividad registrada para sugerir contenido con la política v1 (30+ minutos o 2+ eventos). Es normal si el trabajo fue fuera de herramienta; puedes escribir tu bloque con total libertad.",
      basis: { minutes, eventCount, referenceYmd: input.referenceYmd },
    })
  }

  const yTrim = input.yesterdaySummary.trim()
  if (sufficient && yTrim.length < 12 && (minutes > 0 || eventCount > 0)) {
    hints.push({
      kind: "activity_support_for_review",
      explanation:
        "Hay actividad registrada reciente que podrías reflejar en tu resumen de ayer. Es una señal orientativa basada en datos del sistema; es normal que no cubra todo tu trabajo real.",
      basis: { minutes, eventCount },
    })
  }

  if (yTrim.length > 20 && !sufficient) {
    hints.push({
      kind: "declared_without_recent_logs",
      explanation:
        "Tu texto describe trabajo, y no encontramos muchos registros recientes en la ventana consultada. Puede ser totalmente válido si trabajaste fuera de la herramienta.",
      basis: {},
    })
  }

  return { basis, hints, draftBulletsYesterday }
}
