import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { GuidedSprintPlanningSessionRepository } from "../../guided-sprint-planning/persistence/guided-sprint-planning-session.repository.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "../../guided-sprint-planning/persistence/guided-sprint-planning-candidate-item.repository.js"
import type { GuidedSprintPlanningBaselineRepository } from "../../guided-sprint-planning/persistence/guided-sprint-planning-baseline.repository.js"
import type { GuidedSprintPlanningCandidateItemState } from "../../guided-sprint-planning/domain/guided-sprint-planning-candidate-item.js"
import type { GuidedSprintPlanningSessionState } from "../../guided-sprint-planning/domain/guided-sprint-planning-session.js"
import type { GuidedSprintPlanningBaselineState } from "../../guided-sprint-planning/domain/guided-sprint-planning-baseline.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewGuidedSprintPlanningSessionsReport } from "../policies/guided-sprint-planning-sessions-report.policy.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../domain/project-runtime.errors.js"

const MAX_RANGE_INCLUSIVE_DAYS = 400

function workDateYmdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  const a = workDateYmdToUtcMidnight(fromYmd).getTime()
  const b = workDateYmdToUtcMidnight(toYmd).getTime()
  return Math.floor((b - a) / 86_400_000) + 1
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

export type GuidedSprintPlanningSessionsReportScopeJson =
  | {
      kind: "sprint"
      sprintPublicId: string
      sprintName: string
      startDateYmd: string
      endDateYmd: string
    }
  | {
      kind: "date_range"
      dateFrom: string
      dateTo: string
    }

export type GuidedSprintPlanningSessionsReportCandidateItemJson = {
  workItemPublicId: string
  workItemTitle: string
  storyPoints: number | null
  isReadyForPlanning: boolean
  isCommitted: boolean
  isExcluded: boolean
  excludedReason: GuidedSprintPlanningCandidateItemState["excludedReason"]
  excludedReasonNotes: string | null
  riskNotes: string | null
  dependencyNotes: string | null
  capacityConcern: GuidedSprintPlanningCandidateItemState["capacityConcern"]
  planningDecisionNotes: string | null
}

export type GuidedSprintPlanningSessionsReportBaselineJson = {
  baselinePublicId: string
  sprintGoal: string | null
  committedWorkItemPublicIds: string[]
  capacityTotal: number | null
  capacityUnit: GuidedSprintPlanningBaselineState["capacityUnit"]
  bufferReserved: number | null
  knownRisks: string[]
  knownDependencies: string[]
  baselineWarnings: string[]
  createdAt: string
}

export type GuidedSprintPlanningSessionsReportRowJson = {
  sessionPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  sprintName: string | null
  operationalApproach: string
  operationalTimeZone: string
  planningMode: GuidedSprintPlanningSessionState["planningMode"]
  status: GuidedSprintPlanningSessionState["status"]
  facilitatorUserPublicId: string | null
  facilitatorFullName: string | null
  facilitatorEmailNormalized: string | null
  productOwnerUserPublicId: string | null
  productOwnerFullName: string | null
  productOwnerEmailNormalized: string | null
  planningGoalDraft: string | null
  sprintGoalFinal: string | null
  summary: string | null
  agreements: string[]
  followUps: string[]
  capacityTotal: number | null
  capacityUnit: GuidedSprintPlanningSessionState["capacityUnit"]
  bufferReserved: number | null
  bufferMode: GuidedSprintPlanningSessionState["bufferMode"]
  candidateItemCount: number
  committedItemCount: number
  excludedItemCount: number
  pendingDecisionCount: number
  planningWarnings: string[]
  baselineCreated: boolean
  baseline: GuidedSprintPlanningSessionsReportBaselineJson | null
  candidateItems: GuidedSprintPlanningSessionsReportCandidateItemJson[]
  transcriptAfterClose: null | {
    text: string
    updatedAt: string
    updatedByUserPublicId: string
    updatedByFullName: string | null
    updatedByEmailNormalized: string | null
  }
  additiveNotesAfterClose: string[]
  startedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GuidedSprintPlanningSessionsReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: GuidedSprintPlanningSessionsReportScopeJson
  sessionDateFromInclusive: string
  sessionDateToInclusive: string
  rows: GuidedSprintPlanningSessionsReportRowJson[]
  totalSessionCount: number
}

export class GuidedSprintPlanningSessionsReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sessionRepository: GuidedSprintPlanningSessionRepository,
    private readonly candidateItemRepository: GuidedSprintPlanningCandidateItemRepository,
    private readonly baselineRepository: GuidedSprintPlanningBaselineRepository,
    private readonly scrumBacklogRepository: ScrumBacklogRepository,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  private serializeCandidateItem(
    item: GuidedSprintPlanningCandidateItemState,
    titleByWorkItemId: Map<string, string>,
    storyPointsByWorkItemId: Map<string, number | null>,
  ): GuidedSprintPlanningSessionsReportCandidateItemJson {
    return {
      workItemPublicId: item.workItemPublicId,
      workItemTitle: titleByWorkItemId.get(item.workItemPublicId) ?? "—",
      storyPoints: storyPointsByWorkItemId.get(item.workItemPublicId) ?? null,
      isReadyForPlanning: item.isReadyForPlanning,
      isCommitted: item.isCommitted,
      isExcluded: item.isExcluded,
      excludedReason: item.excludedReason,
      excludedReasonNotes: item.excludedReasonNotes,
      riskNotes: item.riskNotes,
      dependencyNotes: item.dependencyNotes,
      capacityConcern: item.capacityConcern,
      planningDecisionNotes: item.planningDecisionNotes,
    }
  }

  private serializeBaseline(baseline: GuidedSprintPlanningBaselineState): GuidedSprintPlanningSessionsReportBaselineJson {
    return {
      baselinePublicId: baseline.baselinePublicId,
      sprintGoal: baseline.sprintGoal,
      committedWorkItemPublicIds: [...baseline.committedWorkItemPublicIds],
      capacityTotal: baseline.capacityTotal,
      capacityUnit: baseline.capacityUnit,
      bufferReserved: baseline.bufferReserved,
      knownRisks: [...baseline.knownRisks],
      knownDependencies: [...baseline.knownDependencies],
      baselineWarnings: [...baseline.baselineWarnings],
      createdAt: baseline.createdAt.toISOString(),
    }
  }

  async getReport(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: { sprintPublicId: string } | { dateFrom: string; dateTo: string },
  ): Promise<GuidedSprintPlanningSessionsReportJson> {
    assertCanViewGuidedSprintPlanningSessionsReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError(
        "Guided sprint planning sessions report is not available for predictive_phases v1.",
      )
    }

    let scope: GuidedSprintPlanningSessionsReportScopeJson
    let sessionDateFromInclusiveYmd: string
    let sessionDateToInclusiveYmd: string

    if ("sprintPublicId" in input) {
      if (project.operationalApproach !== "scrum") {
        throw new ProjectRuntimeInvalidInputError("Sprint scope is only available for Scrum projects.")
      }
      const sprint = await this.sprintPlanningRepository.findSprintByPublicId(
        workspacePublicId,
        projectPublicId,
        input.sprintPublicId,
      )
      if (!sprint) {
        throw new ProjectRuntimeNotFoundError("Sprint not found.")
      }
      if (!sprint.startDate || !sprint.endDate) {
        throw new ProjectRuntimeInvalidInputError("Sprint must have start and end dates to build this report.")
      }
      const startYmd = ymdFromDate(sprint.startDate)
      const endYmd = ymdFromDate(sprint.endDate)
      if (inclusiveDayCount(startYmd, endYmd) > MAX_RANGE_INCLUSIVE_DAYS) {
        throw new ProjectRuntimeInvalidInputError("Sprint date span exceeds v1 report limit.")
      }
      sessionDateFromInclusiveYmd = startYmd
      sessionDateToInclusiveYmd = endYmd
      scope = {
        kind: "sprint",
        sprintPublicId: sprint.sprintPublicId,
        sprintName: sprint.name,
        startDateYmd: startYmd,
        endDateYmd: endYmd,
      }
    } else {
      const { dateFrom, dateTo } = input
      const days = inclusiveDayCount(dateFrom, dateTo)
      if (days > MAX_RANGE_INCLUSIVE_DAYS) {
        throw new ProjectRuntimeInvalidInputError(
          `Date range cannot exceed ${MAX_RANGE_INCLUSIVE_DAYS} calendar days (UTC).`,
        )
      }
      sessionDateFromInclusiveYmd = dateFrom
      sessionDateToInclusiveYmd = dateTo
      scope = { kind: "date_range", dateFrom, dateTo }
    }

    const sessions = await this.sessionRepository.listForProjectSessionDateRange(
      workspacePublicId,
      projectPublicId,
      sessionDateFromInclusiveYmd,
      sessionDateToInclusiveYmd,
    )

    const members = await this.workspaceMemberRepository.listByWorkspacePublicId(workspacePublicId)
    const memberByUserId = new Map(members.map((m) => [m.userPublicId, m]))

    let sprintNameById = new Map<string, string>()
    const titleByWorkItemId = new Map<string, string>()
    const storyPointsByWorkItemId = new Map<string, number | null>()

    if (project.operationalApproach === "scrum") {
      const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
      sprintNameById = new Map(sprints.map((sp) => [sp.sprintPublicId, sp.name]))
      const backlog = await this.scrumBacklogRepository.listByProject(workspacePublicId, projectPublicId)
      for (const item of backlog) {
        titleByWorkItemId.set(item.backlogItemPublicId, item.title)
        storyPointsByWorkItemId.set(item.backlogItemPublicId, item.storyPoints)
      }
    }

    const candidatesPerSession = await Promise.all(
      sessions.map((s) => this.candidateItemRepository.listBySession(workspacePublicId, projectPublicId, s.sessionPublicId)),
    )

    const baselinesPerSession = await Promise.all(
      sessions.map((s) =>
        s.baselineCreated
          ? this.baselineRepository.findBySessionPublicId(workspacePublicId, projectPublicId, s.sessionPublicId)
          : Promise.resolve(null),
      ),
    )

    const rows: GuidedSprintPlanningSessionsReportRowJson[] = sessions.map((s, i) => {
      const fac = s.facilitatorUserPublicId ? memberByUserId.get(s.facilitatorUserPublicId) : undefined
      const po = s.productOwnerUserPublicId ? memberByUserId.get(s.productOwnerUserPublicId) : undefined
      const rawCandidates = candidatesPerSession[i] ?? []
      const candidateItems = [...rawCandidates]
        .sort((a, b) => {
          const ta = titleByWorkItemId.get(a.workItemPublicId) ?? a.workItemPublicId
          const tb = titleByWorkItemId.get(b.workItemPublicId) ?? b.workItemPublicId
          return ta.localeCompare(tb, "es", { sensitivity: "base" })
        })
        .map((c) => this.serializeCandidateItem(c, titleByWorkItemId, storyPointsByWorkItemId))

      let transcriptAfterClose: GuidedSprintPlanningSessionsReportRowJson["transcriptAfterClose"] = null
      if (s.transcriptAfterClose) {
        const tr = s.transcriptAfterClose
        const trAuthor = memberByUserId.get(tr.updatedByUserPublicId)
        transcriptAfterClose = {
          text: tr.text,
          updatedAt: tr.updatedAt.toISOString(),
          updatedByUserPublicId: tr.updatedByUserPublicId,
          updatedByFullName: trAuthor?.fullName ?? null,
          updatedByEmailNormalized: trAuthor?.emailNormalized ?? null,
        }
      }

      const baselineRow = baselinesPerSession[i]

      return {
        sessionPublicId: s.sessionPublicId,
        sessionDate: s.sessionDate,
        sessionSlot: s.sessionSlot,
        sprintPublicId: s.sprintPublicId,
        sprintName: s.sprintPublicId ? sprintNameById.get(s.sprintPublicId) ?? null : null,
        operationalApproach: s.operationalApproach,
        operationalTimeZone: s.operationalTimeZone,
        planningMode: s.planningMode,
        status: s.status,
        facilitatorUserPublicId: s.facilitatorUserPublicId,
        facilitatorFullName: fac?.fullName ?? null,
        facilitatorEmailNormalized: fac?.emailNormalized ?? null,
        productOwnerUserPublicId: s.productOwnerUserPublicId,
        productOwnerFullName: po?.fullName ?? null,
        productOwnerEmailNormalized: po?.emailNormalized ?? null,
        planningGoalDraft: s.planningGoalDraft,
        sprintGoalFinal: s.sprintGoalFinal,
        summary: s.summary,
        agreements: [...s.agreements],
        followUps: [...s.followUps],
        capacityTotal: s.capacityTotal,
        capacityUnit: s.capacityUnit,
        bufferReserved: s.bufferReserved,
        bufferMode: s.bufferMode,
        candidateItemCount: s.candidateItemCount,
        committedItemCount: s.committedItemCount,
        excludedItemCount: s.excludedItemCount,
        pendingDecisionCount: s.pendingDecisionCount,
        planningWarnings: [...s.planningWarnings],
        baselineCreated: s.baselineCreated,
        baseline: baselineRow ? this.serializeBaseline(baselineRow) : null,
        candidateItems,
        transcriptAfterClose,
        additiveNotesAfterClose: [...s.additiveNotesAfterClose],
        startedAt: toIso(s.startedAt),
        closedAt: toIso(s.closedAt),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }
    })

    return {
      workspacePublicId,
      projectPublicId,
      projectName: project.projectName,
      operationalApproach: project.operationalApproach,
      scope,
      sessionDateFromInclusive: sessionDateFromInclusiveYmd,
      sessionDateToInclusive: sessionDateToInclusiveYmd,
      rows,
      totalSessionCount: rows.length,
    }
  }
}
