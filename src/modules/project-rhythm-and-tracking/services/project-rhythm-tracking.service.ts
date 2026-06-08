import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { KanbanWipConfigDto } from "../../project-kanban-wip-limits/services/kanban-wip-config.service.js"
import { KanbanWipConfigService } from "../../project-kanban-wip-limits/services/kanban-wip-config.service.js"
import type { KanbanMetricsService } from "../../project-kanban-metrics/services/kanban-metrics.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectVelocityResponse, SprintBurndownResponse } from "../../project-scrum-burndown-velocity/services/scrum-burndown-velocity.service.js"
import { ScrumBurndownVelocityService } from "../../project-scrum-burndown-velocity/services/scrum-burndown-velocity.service.js"
import type { ImpedimentService } from "../../project-impediments/services/impediment.service.js"
import type { FlowTimeResponseDto } from "../../project-cycle-lead-time/services/flow-time.service.js"
import { FlowTimeService } from "../../project-cycle-lead-time/services/flow-time.service.js"
import {
  RHYTHM_FLOW_CHART_MIN_COMPLETED_ITEMS,
  RHYTHM_THROUGHPUT_WINDOW_DAYS,
  RHYTHM_VELOCITY_CHART_MIN_CLOSED_SPRINTS,
} from "../domain/project-rhythm-tracking.constants.js"
import type {
  ProjectRhythmTrackingResponseDto,
  RhythmImpedimentsSummary,
  RhythmTrackingFlags,
  RhythmVisualBlock,
  RhythmWipSummary,
} from "../domain/project-rhythm-tracking.dto.js"
import { ProjectRhythmTrackingNotFoundError } from "../domain/project-rhythm-tracking.errors.js"

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

export type ProjectRhythmTrackingServiceOptions = {
  /** Si no hay repo de auditoría, throughput en home se marca como no disponible (OQ-07). */
  auditLogAvailable: boolean
}

export class ProjectRhythmTrackingService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly burndownVelocity: ScrumBurndownVelocityService,
    private readonly flowTime: FlowTimeService,
    private readonly kanbanMetrics: KanbanMetricsService,
    private readonly kanbanWip: KanbanWipConfigService,
    private readonly impediments: ImpedimentService,
    private readonly options: ProjectRhythmTrackingServiceOptions,
  ) {}

  async getRhythmTracking(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    now: Date = new Date(),
  ): Promise<ProjectRhythmTrackingResponseDto> {
    const state = await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!state) {
      throw new ProjectRhythmTrackingNotFoundError()
    }

    switch (state.operationalApproach) {
      case "scrum":
        return this.buildScrum(actor, workspacePublicId, projectPublicId, state, now)
      case "kanban":
        return this.buildKanban(actor, workspacePublicId, projectPublicId, state, now)
      case "predictive_phases":
        return this.buildPredictive(state)
      default: {
        const _x: never = state.operationalApproach
        return _x
      }
    }
  }

  private buildPredictive(state: WorkspaceRuntimeProjectState): ProjectRhythmTrackingResponseDto {
    const ws = state.workspacePublicId
    const proj = state.projectPublicId
    return {
      operationalApproach: "predictive_phases",
      workspacePublicId: ws,
      projectPublicId: proj,
      specificationVersion: "1.0",
      primaryVisual: {
        role: "primary",
        kind: "text_only",
        displayMode: "text",
        title: "Seguimiento por fases",
        subtitle:
          "En v1 no hay KPI de ritmo en esta superficie; revisa el informe o la vista de fases del proyecto.",
        payload: {
          projectName: state.projectName,
        },
      },
      secondaryVisuals: [],
      signals: { impediments: null, wip: null },
      flags: { agingNotAvailableInV1: true },
      dataQualityWarnings: [],
      hasSufficientDataForPrimary: true,
      lastActivity: {
        source: "operational_project_updated_at",
        occurredAt: state.updatedAt.toISOString(),
      },
      ctaTargets: [],
    }
  }

  private async buildScrum(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    state: WorkspaceRuntimeProjectState,
    _now: Date,
  ): Promise<ProjectRhythmTrackingResponseDto> {
    const warnings: string[] = []
    const flags: RhythmTrackingFlags = {}
    const sprints = await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
    const activeSprint = sprints.find((s) => s.status === "active") ?? null

    const velocity = await this.burndownVelocity.getProjectVelocity(workspacePublicId, projectPublicId, 6)
    const insufficientSprintHistory = velocity.sprints.length < RHYTHM_VELOCITY_CHART_MIN_CLOSED_SPRINTS
    if (insufficientSprintHistory) {
      flags.insufficientSprintHistory = true
    }

    let primary: RhythmVisualBlock
    let hasSufficientPrimary: boolean

    if (activeSprint) {
      let burndown: SprintBurndownResponse | null = null
      try {
        burndown = await this.burndownVelocity.getSprintBurndown(
          workspacePublicId,
          projectPublicId,
          activeSprint.sprintPublicId,
          { includeIdealLine: true },
        )
      } catch (e) {
        flags.burndownUnavailable = true
        const msg = e instanceof Error ? e.message : String(e)
        warnings.push(`burndown_unavailable: ${msg}`)
        burndown = null
      }

      if (burndown?.hasSufficientData) {
        primary = this.burndownPrimaryBlock(burndown, activeSprint.name)
        hasSufficientPrimary = true
      } else {
        if (burndown && !burndown.hasSufficientData) {
          flags.burndownUnavailable = true
          warnings.push(
            "burndown_has_insufficient_data: ideal baseline or audit trail insufficient; using committed vs completed history as primary.",
          )
        }
        primary = this.committedCompletedPrimary(
          velocity,
          "Comprometido vs completado",
          activeSprint ? `Fuera de burndown fiable del sprint «${activeSprint.name}».` : undefined,
        )
        hasSufficientPrimary = velocity.sprints.length > 0
      }
    } else {
      primary = this.committedCompletedPrimary(velocity, "Comprometido vs completado en sprints cerrados")
      hasSufficientPrimary = velocity.sprints.length > 0
    }

    const secondaries: RhythmVisualBlock[] = [this.velocitySecondary(velocity, insufficientSprintHistory)]

    const impediments = await this.safeImpedimentsSummaryScrumKanban(
      actor,
      workspacePublicId,
      projectPublicId,
      activeSprint?.sprintPublicId ?? null,
    )

    return {
      operationalApproach: "scrum",
      workspacePublicId,
      projectPublicId,
      specificationVersion: "1.0",
      primaryVisual: primary,
      secondaryVisuals: secondaries,
      signals: { impediments, wip: null },
      flags,
      dataQualityWarnings: [...new Set([...warnings, ...velocity.dataQualityWarnings])],
      hasSufficientDataForPrimary: hasSufficientPrimary,
      lastActivity: {
        source: "operational_project_updated_at",
        occurredAt: state.updatedAt.toISOString(),
      },
      ctaTargets: [],
    }
  }

  private burndownPrimaryBlock(burndown: SprintBurndownResponse, sprintName: string): RhythmVisualBlock {
    return {
      role: "primary",
      kind: "burndown",
      displayMode: "chart",
      title: "Burndown del sprint",
      subtitle: sprintName,
      payload: {
        sprintPublicId: burndown.sprintPublicId,
        unit: burndown.unit,
        days: burndown.days,
        hasSufficientData: burndown.hasSufficientData,
        dataQualityWarnings: burndown.dataQualityWarnings,
        calculationNotes: burndown.calculationNotes,
        scopeChangeDetected: burndown.scopeChangeDetected,
        initialCommittedPoints: burndown.initialCommittedPoints,
        completedPointsAsOfLastDay: burndown.completedPointsAsOfLastDay,
      },
    }
  }

  private committedCompletedPrimary(
    velocity: ProjectVelocityResponse,
    title: string,
    subtitle?: string,
  ): RhythmVisualBlock {
    const hasRows = velocity.sprints.length > 0
    return {
      role: "primary",
      kind: "committed_completed",
      displayMode: hasRows ? "chart" : "degraded",
      title,
      subtitle:
        subtitle ??
        (hasRows ? undefined : "No hay sprints cerrados con métricas v2 para comparar comprometido vs completado."),
      payload: {
        unit: velocity.unit,
        sprints: velocity.sprints.map((s) => ({
          sprintPublicId: s.sprintPublicId,
          name: s.name,
          closedAt: s.closedAt,
          committedStoryPoints: s.committedStoryPoints,
          completedStoryPoints: s.completedStoryPoints,
          dataQualityWarnings: s.dataQualityWarnings,
        })),
        calculationNotes: velocity.calculationNotes,
      },
    }
  }

  private velocitySecondary(velocity: ProjectVelocityResponse, insufficientSprintHistory: boolean): RhythmVisualBlock {
    const chartEligible = velocity.sprints.length >= RHYTHM_VELOCITY_CHART_MIN_CLOSED_SPRINTS
    return {
      role: "secondary",
      kind: "velocity",
      displayMode: chartEligible ? "chart" : velocity.sprints.length === 0 ? "degraded" : "text",
      title: "Velocity",
      subtitle: chartEligible
        ? undefined
        : insufficientSprintHistory
          ? `Se necesitan al menos ${RHYTHM_VELOCITY_CHART_MIN_CLOSED_SPRINTS} sprints cerrados con métricas para gráfico.`
          : undefined,
      payload: {
        unit: velocity.unit,
        sprints: velocity.sprints,
        averageVelocityLastN: velocity.averageVelocityLastN,
        lastN: velocity.lastN,
        chartEligible,
        hasSufficientData: velocity.hasSufficientData,
        calculationNotes: velocity.calculationNotes,
        dataQualityWarnings: velocity.dataQualityWarnings,
      },
    }
  }

  private async buildKanban(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    state: WorkspaceRuntimeProjectState,
    now: Date,
  ): Promise<ProjectRhythmTrackingResponseDto> {
    const flags: RhythmTrackingFlags = {
      agingNotAvailableInV1: true,
    }
    const from = addUtcDays(startOfUtcDay(now), -RHYTHM_THROUGHPUT_WINDOW_DAYS)

    const flowTime = await this.flowTime.getFlowTime(
      actor,
      workspacePublicId,
      projectPublicId,
      {
        from: from.toISOString(),
        to: now.toISOString(),
        timeZone: "UTC",
        includeItemDetails: false,
      },
      now,
    )

    const chartEligible = flowTime.hasSufficientData
    if (!chartEligible) {
      flags.insufficientCompletedItems = true
    }

    const primary = this.leadPrimary(flowTime, chartEligible)
    const secondaries: RhythmVisualBlock[] = [this.cycleSecondary(flowTime, chartEligible)]

    const { throughputBlock, throughputUnavailable } = await this.buildThroughputSecondary(
      actor,
      workspacePublicId,
      projectPublicId,
      from,
      now,
    )
    if (throughputUnavailable) {
      flags.throughputUnavailable = true
    }
    secondaries.push(throughputBlock)

    let wip: RhythmWipSummary | null = null
    try {
      const dto = await this.kanbanWip.getWip(actor, workspacePublicId, projectPublicId)
      wip = this.summarizeWip(dto)
    } catch {
      wip = null
    }

    const impediments = await this.safeImpedimentsSummaryScrumKanban(actor, workspacePublicId, projectPublicId, null)

    const dq = flowTime.dataQualityWarnings.map((w) => `${w.code}: ${w.message}`)

    return {
      operationalApproach: "kanban",
      workspacePublicId,
      projectPublicId,
      specificationVersion: "1.0",
      primaryVisual: primary,
      secondaryVisuals: secondaries,
      signals: { wip, impediments },
      flags,
      dataQualityWarnings: [...dq, ...flowTime.calculationNotes].slice(0, 40),
      hasSufficientDataForPrimary: flowTime.sample.completedItemsCount > 0,
      lastActivity: {
        source: "operational_project_updated_at",
        occurredAt: state.updatedAt.toISOString(),
      },
      ctaTargets: [],
    }
  }

  private leadPrimary(flowTime: FlowTimeResponseDto, chartEligible: boolean): RhythmVisualBlock {
    const n = flowTime.sample.completedItemsCount
    return {
      role: "primary",
      kind: "lead_time",
      displayMode: chartEligible ? "chart" : n > 0 ? "text" : "degraded",
      title: "Lead time",
      subtitle: chartEligible
        ? undefined
        : n > 0
          ? `Menos de ${RHYTHM_FLOW_CHART_MIN_COMPLETED_ITEMS} ítems completados en la ventana: sin gráfico principal.`
          : "Sin ítems completados en la ventana de 14 días.",
      payload: {
        unit: flowTime.leadTime.unit,
        meanDays: flowTime.leadTime.meanDays,
        period: flowTime.period,
        sample: flowTime.sample,
        definitions: flowTime.definitions,
        hasSufficientData: flowTime.hasSufficientData,
        dataQualityWarnings: flowTime.dataQualityWarnings,
      },
    }
  }

  private cycleSecondary(flowTime: FlowTimeResponseDto, chartEligible: boolean): RhythmVisualBlock {
    const n = flowTime.sample.completedItemsCount
    return {
      role: "secondary",
      kind: "cycle_time",
      displayMode: flowTime.cycleTime.unavailable ? "degraded" : chartEligible ? "chart" : n > 0 ? "text" : "degraded",
      title: "Cycle time",
      subtitle: flowTime.cycleTime.unavailable ? "No aplicable con la configuración o trazas actuales." : undefined,
      payload: {
        unit: flowTime.cycleTime.unit,
        meanDays: flowTime.cycleTime.meanDays,
        unavailable: flowTime.cycleTime.unavailable,
        sample: flowTime.sample,
        chartEligible,
      },
    }
  }

  private async buildThroughputSecondary(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    from: Date,
    to: Date,
  ): Promise<{ throughputBlock: RhythmVisualBlock; throughputUnavailable: boolean }> {
    let throughputUnavailable = !this.options.auditLogAvailable
    let completedItemsCount = 0
    let weeks: unknown[] = []
    let period: { from: string; to: string } | null = null

    if (this.options.auditLogAvailable) {
      try {
        const thr = await this.kanbanMetrics.getThroughput(
          actor,
          workspacePublicId,
          projectPublicId,
          { from: from.toISOString(), to: to.toISOString() },
          to,
        )
        period = { from: thr.from, to: thr.to }
        weeks = thr.weeks
        completedItemsCount = thr.weeks.reduce((s, w) => s + w.completedItemsCount, 0)
        if (!thr.leadTimeFromFlowEntry.basedOnAudit) {
          throughputUnavailable = true
        }
      } catch {
        throughputUnavailable = true
      }
    }

    const throughputBlock: RhythmVisualBlock = {
      role: "secondary",
      kind: "throughput",
      displayMode: throughputUnavailable ? "degraded" : "text",
      title: `Throughput (últimos ${RHYTHM_THROUGHPUT_WINDOW_DAYS} días)`,
      subtitle: throughputUnavailable
        ? "Throughput no disponible de forma fiable; abrir métricas vivas del proyecto."
        : undefined,
      payload: throughputUnavailable
        ? {
            windowDays: RHYTHM_THROUGHPUT_WINDOW_DAYS,
            unavailable: true,
          }
        : {
            windowDays: RHYTHM_THROUGHPUT_WINDOW_DAYS,
            period,
            completedItemsCount,
            weeks,
          },
    }

    return { throughputBlock, throughputUnavailable }
  }

  private summarizeWip(dto: KanbanWipConfigDto): RhythmWipSummary {
    const riskCols = dto.columns.filter((c) => c.state === "near" || c.state === "at_limit" || c.state === "exceeded")
    const exceeded = dto.columns.filter((c) => c.state === "exceeded")
    const hints = riskCols.slice(0, 5).map((c) => ({
      columnPublicId: c.column_public_id,
      name: c.name,
      state: c.state,
      currentCount: c.current_count,
      limit: c.limit,
    }))
    return {
      columnsAtRiskCount: riskCols.length,
      columnsExceededCount: exceeded.length,
      columnHints: hints,
    }
  }

  private async safeImpedimentsSummaryScrumKanban(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string | null,
  ): Promise<RhythmImpedimentsSummary | null> {
    try {
      const filters = {
        status: ["open", "in_review", "mitigating"] as ("open" | "in_review" | "mitigating")[],
        ...(sprintPublicId ? { relatedSprintPublicId: sprintPublicId } : {}),
      }
      const res = await this.impediments.listImpediments(actor, workspacePublicId, projectPublicId, filters, {
        limit: 500,
        offset: 0,
      })
      const bySeverity: RhythmImpedimentsSummary["bySeverity"] = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      }
      let open = 0
      let inReview = 0
      let mitigating = 0
      for (const it of res.items) {
        bySeverity[it.severity] += 1
        if (it.status === "open") open += 1
        if (it.status === "in_review") inReview += 1
        if (it.status === "mitigating") mitigating += 1
      }
      return {
        activeTotalCount: res.totalCount,
        activeOpenCount: open,
        activeInReviewCount: inReview,
        activeMitigatingCount: mitigating,
        bySeverity,
        scopedToSprintPublicId: sprintPublicId,
      }
    } catch {
      return null
    }
  }
}
