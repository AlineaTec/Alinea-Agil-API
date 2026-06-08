import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { DailyAlignmentSessionRepository } from "../../daily-alignment/persistence/daily-alignment-session.repository.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewAlignmentSessionsReport } from "../policies/alignment-sessions-report.policy.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../domain/project-runtime.errors.js"

const MAX_RANGE_INCLUSIVE_DAYS = 400

function workDateYmdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

function ymdFromDate(dce: Date): string {
  return dce.toISOString().slice(0, 10)
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  const a = workDateYmdToUtcMidnight(fromYmd).getTime()
  const b = workDateYmdToUtcMidnight(toYmd).getTime()
  return Math.floor((b - a) / 86_400_000) + 1
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

export type AlignmentSessionsReportRowJson = {
  sessionPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  sprintName: string | null
  operationalApproach: string
  operationalTimeZone: string
  alignmentMode: "live" | "async"
  status: "open" | "closed" | "closed_incomplete"
  facilitatorUserPublicId: string | null
  facilitatorFullName: string | null
  facilitatorEmailNormalized: string | null
  startedAt: string | null
  closedAt: string | null
  closeoutSummary: string | null
  facilitatorTranscript: string | null
  agreements: string[]
  escalatedImpediments: string[]
  followUps: string[]
  createdAt: string
  updatedAt: string
}

export type AlignmentSessionsReportScopeJson =
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

export type AlignmentSessionsReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: AlignmentSessionsReportScopeJson
  /** Rango de `sessionDate` (YMD UTC) incluido en el informe; coincide con fechas de sprint o rango pedido. */
  sessionDateFromInclusive: string
  sessionDateToInclusive: string
  rows: AlignmentSessionsReportRowJson[]
  totalSessionCount: number
}

export class AlignmentSessionsReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sessionRepository: DailyAlignmentSessionRepository,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  async getReport(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input:
      | { sprintPublicId: string }
      | {
          dateFrom: string
          dateTo: string
        },
  ): Promise<AlignmentSessionsReportJson> {
    assertCanViewAlignmentSessionsReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError("Alignment sessions report is not available for predictive_phases v1.")
    }

    let scope: AlignmentSessionsReportScopeJson
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
    if (project.operationalApproach === "scrum") {
      const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
      sprintNameById = new Map(sprints.map((sp) => [sp.sprintPublicId, sp.name]))
    }

    const rows: AlignmentSessionsReportRowJson[] = sessions.map((s) => {
      const fac = s.facilitatorUserPublicId ? memberByUserId.get(s.facilitatorUserPublicId) : undefined
      return {
        sessionPublicId: s.sessionPublicId,
        sessionDate: s.sessionDate,
        sessionSlot: s.sessionSlot,
        sprintPublicId: s.sprintPublicId,
        sprintName: s.sprintPublicId ? sprintNameById.get(s.sprintPublicId) ?? null : null,
        operationalApproach: s.operationalApproach,
        operationalTimeZone: s.operationalTimeZone,
        alignmentMode: s.alignmentMode,
        status: s.status,
        facilitatorUserPublicId: s.facilitatorUserPublicId,
        facilitatorFullName: fac?.fullName ?? null,
        facilitatorEmailNormalized: fac?.emailNormalized ?? null,
        startedAt: toIso(s.startedAt),
        closedAt: toIso(s.closedAt),
        closeoutSummary: s.closeoutSummary,
        facilitatorTranscript: s.facilitatorTranscript,
        agreements: [...s.agreements],
        escalatedImpediments: [...s.escalatedImpediments],
        followUps: [...s.followUps],
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
