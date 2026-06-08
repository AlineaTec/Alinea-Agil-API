import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export type RhythmVisualDisplayMode = "chart" | "text" | "degraded"

/** Subconjunto estable para UI; alineado a contracts `project-rhythm-and-tracking`. */
export type RhythmVisualKind =
  | "burndown"
  | "committed_completed"
  | "velocity"
  | "lead_time"
  | "cycle_time"
  | "throughput"
  | "text_only"

export type RhythmVisualBlock = {
  role: "primary" | "secondary"
  kind: RhythmVisualKind
  displayMode: RhythmVisualDisplayMode
  title: string
  subtitle?: string
  /** Datos mínimos para pintar sin llamadas extra; shapes por `kind`. */
  payload: Record<string, unknown>
}

export type RhythmImpedimentsSummary = {
  /** Impedimentos activos (open | in_review | mitigating). */
  activeTotalCount: number
  activeOpenCount: number
  activeInReviewCount: number
  activeMitigatingCount: number
  bySeverity: {
    low: number
    medium: number
    high: number
    critical: number
  }
  /** Si se aplicó filtro por sprint activo Scrum. */
  scopedToSprintPublicId: string | null
}

export type RhythmWipSummary = {
  /** Columnas con WIP definido en estado near, at_limit o exceeded. */
  columnsAtRiskCount: number
  columnsExceededCount: number
  /** Una línea por columna en riesgo (máx. 5). */
  columnHints: Array<{ columnPublicId: string; name: string; state: string; currentCount: number; limit: number | null }>
}

export type RhythmCtaTarget = {
  id: string
  label: string
  /** Path sugerido (SPA o API relativa); `web` sustituye params. */
  path: string
}

export type RhythmTrackingFlags = {
  insufficientSprintHistory?: boolean
  insufficientCompletedItems?: boolean
  throughputUnavailable?: boolean
  burndownUnavailable?: boolean
  /** Aging explícitamente fuera de v1 (OQ-05). */
  agingNotAvailableInV1?: boolean
}

export type ProjectRhythmTrackingResponseDto = {
  operationalApproach: OperationalApproach
  workspacePublicId: string
  projectPublicId: string
  specificationVersion: "1.0"
  primaryVisual: RhythmVisualBlock
  secondaryVisuals: RhythmVisualBlock[]
  signals: {
    impediments?: RhythmImpedimentsSummary | null
    wip?: RhythmWipSummary | null
  }
  flags: RhythmTrackingFlags
  dataQualityWarnings: string[]
  hasSufficientDataForPrimary: boolean
  /**
   * Best-effort (OQ-13): `updatedAt` del runtime del proyecto cuando existe estado operativo.
   * No es un contrato de “última actividad de negocio” nuevo.
   */
  lastActivity: { source: "operational_project_updated_at"; occurredAt: string } | null
  ctaTargets: RhythmCtaTarget[]
}
