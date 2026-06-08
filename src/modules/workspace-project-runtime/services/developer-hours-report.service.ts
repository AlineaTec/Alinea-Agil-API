import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkItemTimeEntriesRepository } from "../../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewDeveloperHoursReport } from "../policies/developer-hours-report.policy.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../domain/project-runtime.errors.js"

const MAX_RANGE_INCLUSIVE_DAYS = 400

function workDateYmdToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

function utcAddCalendarDays(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

function ymdFromDate(dce: Date): string {
  return dce.toISOString().slice(0, 10)
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  const a = workDateYmdToUtcMidnight(fromYmd).getTime()
  const b = workDateYmdToUtcMidnight(toYmd).getTime()
  return Math.floor((b - a) / 86_400_000) + 1
}

export type DeveloperHoursReportRowJson = {
  userPublicId: string
  fullName: string
  emailNormalized: string
  totalMinutes: number
}

export type DeveloperHoursReportScopeJson =
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

export type DeveloperHoursReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: DeveloperHoursReportScopeJson
  workDateFromInclusive: string
  /** Último día calendario UTC incluido; la ventana de consulta usa el instante exclusivo al día siguiente. */
  workDateToInclusive: string
  rows: DeveloperHoursReportRowJson[]
  totalRowCount: number
  totalMinutes: number
}

export class DeveloperHoursReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly timeEntriesRepository: WorkItemTimeEntriesRepository,
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
  ): Promise<DeveloperHoursReportJson> {
    assertCanViewDeveloperHoursReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError("Developer hours report is not available for predictive_phases v1.")
    }

    let scope: DeveloperHoursReportScopeJson
    let fromInclusive: Date
    let toExclusive: Date
    let workDateFromInclusiveYmd: string
    let workDateToInclusiveYmd: string

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
      fromInclusive = workDateYmdToUtcMidnight(startYmd)
      toExclusive = utcAddCalendarDays(workDateYmdToUtcMidnight(endYmd), 1)
      workDateFromInclusiveYmd = startYmd
      workDateToInclusiveYmd = endYmd
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
      fromInclusive = workDateYmdToUtcMidnight(dateFrom)
      toExclusive = utcAddCalendarDays(workDateYmdToUtcMidnight(dateTo), 1)
      workDateFromInclusiveYmd = dateFrom
      workDateToInclusiveYmd = dateTo
      scope = { kind: "date_range", dateFrom, dateTo }
    }

    const members = await this.workspaceMemberRepository.listByWorkspacePublicId(workspacePublicId)
    const developerUserIds = members
      .filter(
        (m) => m.status !== "deactivated" && m.workspaceRoleMethodological === "scrum_developer",
      )
      .map((m) => m.userPublicId)

    const aggregates = await this.timeEntriesRepository.aggregateMinutesByDevelopersForProjectWorkDateRange(
      workspacePublicId,
      projectPublicId,
      developerUserIds,
      fromInclusive,
      toExclusive,
    )
    const byUser = new Map(aggregates.map((a) => [a.userPublicId, a.totalMinutes]))
    const devMemberById = new Map(
      members.filter((m) => developerUserIds.includes(m.userPublicId)).map((m) => [m.userPublicId, m]),
    )

    const rows: DeveloperHoursReportRowJson[] = developerUserIds
      .map((userPublicId) => {
        const m = devMemberById.get(userPublicId)
        return {
          userPublicId,
          fullName: m?.fullName ?? userPublicId,
          emailNormalized: m?.emailNormalized ?? "",
          totalMinutes: byUser.get(userPublicId) ?? 0,
        }
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }))

    const totalMinutes = rows.reduce((s, r) => s + r.totalMinutes, 0)

    return {
      workspacePublicId,
      projectPublicId,
      projectName: project.projectName,
      operationalApproach: project.operationalApproach,
      scope,
      workDateFromInclusive: workDateFromInclusiveYmd,
      workDateToInclusive: workDateToInclusiveYmd,
      rows,
      totalRowCount: rows.length,
      totalMinutes,
    }
  }
}
