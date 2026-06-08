import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import { KANBAN_METRICS_AUDIT_ACTIONS, KANBAN_METRICS_AUDIT_CATEGORIES } from "../../project-kanban-metrics/services/kanban-metrics-audit.helpers.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { ProjectRuntimeInvalidInputError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  FLOW_TIME_AUDIT_LOOKBACK_DAYS,
  FLOW_TIME_LOW_SAMPLE_THRESHOLD,
} from "../domain/flow-time.constants.js"
import { resolveFlowTimeSemanticColumns } from "../domain/flow-time-column-roles.js"
import { FlowTimeScrumNotSupportedError } from "../domain/flow-time.errors.js"
import { averageOneDecimal, elapsedFractionalDays } from "../domain/flow-time-math.js"
import {
  groupItemEvents,
  lastCompletionInWindow,
  replayCompletionsForItem,
} from "../domain/flow-time-replay.js"
import { resolveFlowTimeWindow, type FlowTimeWindow } from "../domain/flow-time-window.js"
import {
  assertCanReadFlowTimeSummary,
} from "../policies/flow-time-authorization.policy.js"
import { kanbanMemberHasFlowTimeDetailRead } from "../../project-kanban-permissions/policies/kanban-member-capabilities.policy.js"

export type FlowTimeWarning = { code: string; message: string }

export type FlowTimeItemRowDto = {
  workItemPublicId: string
  title: string | null
  leadTimeDays: number
  cycleTimeDays: number | null
  leadStartedAt: string
  cycleStartedAt: string | null
  endedAt: string
  warnings: string[]
  detailTitlesRedacted: boolean
}

export type FlowTimeResponseDto = {
  operationalApproach: "kanban"
  period: { from: string; to: string; timeZone: string }
  definitions: {
    leadTimeStartedAt: "flow_entry"
    cycleTimeStartedAt: "execution_start"
    endedAt: "terminal_done_column"
  }
  hasSufficientData: boolean
  sample: { completedItemsCount: number; lowSample: boolean; lowSampleThreshold: number }
  leadTime: {
    unit: "days"
    meanDays: number | null
  }
  cycleTime: {
    unit: "days"
    meanDays: number | null
    unavailable: boolean
  }
  dataQualityWarnings: FlowTimeWarning[]
  calculationNotes: string[]
  items: FlowTimeItemRowDto[] | null
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

export class FlowTimeService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly backlogRepository: ScrumBacklogRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null,
  ) {}

  private async requireKanbanProjectOrScrumError(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<void> {
    try {
      await this.projectRuntimeService.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    } catch (e) {
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new FlowTimeScrumNotSupportedError()
      }
      throw e
    }
  }

  async getFlowTime(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    query: { from?: string; to?: string; timeZone?: string; includeItemDetails?: boolean },
    now: Date = new Date(),
  ): Promise<FlowTimeResponseDto> {
    assertCanReadFlowTimeSummary(actor)
    await this.requireKanbanProjectOrScrumError(workspacePublicId, projectPublicId)
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const window = resolveFlowTimeWindow(
      { from: query.from, to: query.to, timeZone: query.timeZone },
      now,
    )
    const includeItems = query.includeItemDetails === true
    const showTitles = kanbanMemberHasFlowTimeDetailRead(actor)

    const { payload, itemRows } = await this.computeFlowTime(
      workspacePublicId,
      projectPublicId,
      flow,
      window,
      now,
      { withItems: includeItems, redactTitles: !showTitles },
    )

    return {
      ...payload,
      items: includeItems ? itemRows : null,
    }
  }

  private async computeFlowTime(
    workspacePublicId: string,
    projectPublicId: string,
    flow: ProjectKanbanFlowConfigState,
    window: FlowTimeWindow,
    now: Date,
    options: { withItems: boolean; redactTitles: boolean },
  ): Promise<{
    payload: Omit<FlowTimeResponseDto, "items">
    itemRows: FlowTimeItemRowDto[]
  }> {
    const { from, to } = window
    const dataQualityWarnings: FlowTimeWarning[] = []
    const calculationNotes: string[] = [
      "Lead time = días (reloj) desde primera entrada a la columna de flujo (flow_entry) hasta cierre en columna terminal.",
      "Cycle time = desde primera entrada a la primera columna de trabajo entre Ready y Done (execution_start) hasta el mismo cierre, si existe esa columna y evento.",
      "Muestra v1: una fila por ítem = carrera cuya última finalización a terminal cae en [from, to).",
    ]
    if (window.timeZone === "UTC") {
      calculationNotes.push(
        "Zona horaria en payload: mientras no exista persistencia de IANA del workspace, los límites por fecha usan UTC para fechas puras; instantes ISO se interpretan tal cual.",
      )
    }

    const semantic = resolveFlowTimeSemanticColumns(flow)
    if (!semantic.executionStartColumnPublicId) {
      dataQualityWarnings.push({
        code: "cycle_time_unavailable",
        message:
          "No se pudo derivar columna de inicio de ejecución (ninguna columna entre entrada y terminal).",
      })
    }

    if (!this.auditLogRepository) {
      const payload: Omit<FlowTimeResponseDto, "items"> = {
        operationalApproach: "kanban",
        period: { from: from.toISOString(), to: to.toISOString(), timeZone: window.timeZone },
        definitions: {
          leadTimeStartedAt: "flow_entry",
          cycleTimeStartedAt: "execution_start",
          endedAt: "terminal_done_column",
        },
        hasSufficientData: false,
        sample: {
          completedItemsCount: 0,
          lowSample: false,
          lowSampleThreshold: FLOW_TIME_LOW_SAMPLE_THRESHOLD,
        },
        leadTime: { unit: "days", meanDays: null },
        cycleTime: { unit: "days", meanDays: null, unavailable: true },
        dataQualityWarnings: [
          ...dataQualityWarnings,
          { code: "log_incomplete", message: "Repositorio de auditoría no disponible; sin replay de flujo." },
        ],
        calculationNotes: [...calculationNotes, "Sin log de movimientos no se calcula lead/cycle."],
      }
      return { payload, itemRows: [] }
    }

    const lookbackStart = addUtcDays(startOfUtcDay(now), -FLOW_TIME_AUDIT_LOOKBACK_DAYS)
    const auditFrom = new Date(Math.min(lookbackStart.getTime(), from.getTime()))
    const rows: WorkspaceAuditLogListRow[] =
      (await this.auditLogRepository.listForProject({
        workspacePublicId,
        projectPublicId,
        categories: [...KANBAN_METRICS_AUDIT_CATEGORIES],
        actions: [...KANBAN_METRICS_AUDIT_ACTIONS],
        occurredAtFrom: auditFrom,
        occurredAtTo: to,
      })) ?? []

    const byItem = groupItemEvents(rows)
    const leadSamples: number[] = []
    const cycleSamples: number[] = []
    const perItem: Array<{
      workItemPublicId: string
      leadDays: number
      cycleDays: number | null
      leadStart: Date
      cycleStart: Date | null
      done: Date
      itemWarnings: string[]
    }> = []

    for (const [itemId, evs] of byItem) {
      const allDone = replayCompletionsForItem(itemId, evs, semantic)
      const pick = lastCompletionInWindow(allDone, from, to)
      if (!pick) continue
      const leadD = elapsedFractionalDays(pick.leadStartedAt, pick.doneAt)
      const cycleD =
        pick.cycleStartedAt && semantic.executionStartColumnPublicId
          ? elapsedFractionalDays(pick.cycleStartedAt, pick.doneAt)
          : null
      leadSamples.push(leadD)
      if (cycleD !== null) cycleSamples.push(cycleD)
      const iw: string[] = []
      if (!pick.cycleStartedAt) iw.push("cycle_time_unavailable")
      perItem.push({
        workItemPublicId: itemId,
        leadDays: leadD,
        cycleDays: cycleD,
        leadStart: pick.leadStartedAt,
        cycleStart: pick.cycleStartedAt,
        done: pick.doneAt,
        itemWarnings: iw,
      })
    }

    const n = perItem.length
    const hasSufficientData = n >= FLOW_TIME_LOW_SAMPLE_THRESHOLD
    const lowSample = n > 0 && n < FLOW_TIME_LOW_SAMPLE_THRESHOLD
    if (n === 0) {
      dataQualityWarnings.push({ code: "empty", message: "N = 0 completados a terminal en [from, to)." })
    } else if (lowSample) {
      dataQualityWarnings.push({
        code: "low_sample",
        message: `Muestra pequeña (N=${n} < ${FLOW_TIME_LOW_SAMPLE_THRESHOLD}); promedios poco estables.`,
      })
    }
    if (cycleSamples.length < n) {
      dataQualityWarnings.push({
        code: "cycle_time_degraded",
        message: "Algunos ítems sin cycle time (falta execution_start o traza insuficiente).",
      })
    }

    const itemsById = new Map<string, ScrumBacklogItemState>()
    if (options.withItems) {
      const allBoard = await this.backlogRepository.listKanbanBoardItems(workspacePublicId, projectPublicId)
      for (const it of allBoard) {
        itemsById.set(it.backlogItemPublicId, it)
      }
    }

    const itemRows: FlowTimeItemRowDto[] = perItem
      .sort((a, b) => b.done.getTime() - a.done.getTime())
      .map((p) => {
        const meta = itemsById.get(p.workItemPublicId)
        const title =
          options.redactTitles ? null : (meta?.title ?? "(sin título en backlog)")
        return {
          workItemPublicId: p.workItemPublicId,
          title,
          leadTimeDays: p.leadDays,
          cycleTimeDays: p.cycleDays,
          leadStartedAt: p.leadStart.toISOString(),
          cycleStartedAt: p.cycleStart?.toISOString() ?? null,
          endedAt: p.done.toISOString(),
          warnings: p.itemWarnings,
          detailTitlesRedacted: options.redactTitles,
        }
      })

    const meanLead = averageOneDecimal(leadSamples)
    const meanCycle = cycleSamples.length > 0 ? averageOneDecimal(cycleSamples) : null

    const payload: Omit<FlowTimeResponseDto, "items"> = {
      operationalApproach: "kanban",
      period: { from: from.toISOString(), to: to.toISOString(), timeZone: window.timeZone },
      definitions: {
        leadTimeStartedAt: "flow_entry",
        cycleTimeStartedAt: "execution_start",
        endedAt: "terminal_done_column",
      },
      hasSufficientData,
      sample: {
        completedItemsCount: n,
        lowSample,
        lowSampleThreshold: FLOW_TIME_LOW_SAMPLE_THRESHOLD,
      },
      leadTime: { unit: "days", meanDays: meanLead },
      cycleTime: {
        unit: "days",
        meanDays: meanCycle,
        unavailable: !semantic.executionStartColumnPublicId || cycleSamples.length === 0,
      },
      dataQualityWarnings,
      calculationNotes,
    }
    return { payload, itemRows }
  }
}
