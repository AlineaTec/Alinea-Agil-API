import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "../../guided-retrospective/persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../../guided-retrospective/persistence/guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveActionItemState } from "../../guided-retrospective/domain/guided-retrospective-action-item.js"
import type { GuidedRetrospectiveSessionState } from "../../guided-retrospective/domain/guided-retrospective-session.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewGuidedRetrospectiveSessionsReport } from "../policies/guided-retrospective-sessions-report.policy.js"
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

export type GuidedRetrospectiveSessionsReportScopeJson =
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

type ReportMemberRefJson = {
  userPublicId: string
  fullName: string | null
  emailNormalized: string | null
}

export type GuidedRetrospectiveSessionsReportActionHistoryEntryJson = {
  historyEntryPublicId: string
  actorUserPublicId: string
  actorFullName: string | null
  actorEmailNormalized: string | null
  occurredAt: string
  kind: GuidedRetrospectiveActionItemState["history"][number]["kind"]
  message: string
}

export type GuidedRetrospectiveSessionsReportActionItemJson = {
  actionItemPublicId: string
  title: string
  description: string | null
  ownerUserPublicId: string | null
  ownerFullName: string | null
  ownerEmailNormalized: string | null
  dueDate: string | null
  priority: GuidedRetrospectiveActionItemState["priority"]
  status: GuidedRetrospectiveActionItemState["status"]
  sourceContributionIds: string[]
  sourceTopicPublicIds: string[]
  history: GuidedRetrospectiveSessionsReportActionHistoryEntryJson[]
  createdAt: string
  updatedAt: string
}

export type GuidedRetrospectiveSessionsReportRowJson = {
  sessionPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  sprintName: string | null
  retrospectivePeriod: GuidedRetrospectiveSessionState["retrospectivePeriod"]
  operationalApproach: string
  operationalTimeZone: string
  retrospectiveMode: GuidedRetrospectiveSessionState["retrospectiveMode"]
  status: GuidedRetrospectiveSessionState["status"]
  facilitatorUserPublicId: string | null
  facilitatorFullName: string | null
  facilitatorEmailNormalized: string | null
  goalSummary: string | null
  summary: string | null
  agreements: string[]
  participantCount: number
  participantWithContributionCount: number
  contributionCount: number
  topicCount: number
  voteRecordCount: number
  sessionVoteStickerTotal: number
  templateKey: string
  transcriptAfterClose: null | {
    text: string
    updatedAt: string
    updatedByUserPublicId: string
    updatedByFullName: string | null
    updatedByEmailNormalized: string | null
  }
  additiveNotesAfterClose: Array<{
    noteText: string
    createdAt: string
    createdByUserPublicId: string
    createdByFullName: string | null
    createdByEmailNormalized: string | null
  }>
  contextHints: Record<string, string> | null
  actionItems: GuidedRetrospectiveSessionsReportActionItemJson[]
  actionItemCount: number
  startedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GuidedRetrospectiveSessionsReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: GuidedRetrospectiveSessionsReportScopeJson
  sessionDateFromInclusive: string
  sessionDateToInclusive: string
  rows: GuidedRetrospectiveSessionsReportRowJson[]
  totalSessionCount: number
}

export class GuidedRetrospectiveSessionsReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sessionRepository: GuidedRetrospectiveSessionRepository,
    private readonly actionItemRepository: GuidedRetrospectiveActionItemRepository,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  private memberRef(userPublicId: string, memberByUserId: Map<string, WorkspaceMemberState>): ReportMemberRefJson {
    const m = memberByUserId.get(userPublicId)
    return {
      userPublicId,
      fullName: m?.fullName ?? null,
      emailNormalized: m?.emailNormalized ?? null,
    }
  }

  private serializeActionItem(
    item: GuidedRetrospectiveActionItemState,
    memberByUserId: Map<string, WorkspaceMemberState>,
  ): GuidedRetrospectiveSessionsReportActionItemJson {
    const ownerRef =
      item.ownerUserPublicId !== null ? this.memberRef(item.ownerUserPublicId, memberByUserId) : null
    return {
      actionItemPublicId: item.actionItemPublicId,
      title: item.title,
      description: item.description,
      ownerUserPublicId: item.ownerUserPublicId,
      ownerFullName: ownerRef?.fullName ?? null,
      ownerEmailNormalized: ownerRef?.emailNormalized ?? null,
      dueDate: item.dueDate,
      priority: item.priority,
      status: item.status,
      sourceContributionIds: [...item.sourceContributionIds],
      sourceTopicPublicIds: [...item.sourceTopicPublicIds],
      history: item.history.map((h) => {
        const a = memberByUserId.get(h.actorUserPublicId)
        return {
          historyEntryPublicId: h.historyEntryPublicId,
          actorUserPublicId: h.actorUserPublicId,
          actorFullName: a?.fullName ?? null,
          actorEmailNormalized: a?.emailNormalized ?? null,
          occurredAt: h.occurredAt.toISOString(),
          kind: h.kind,
          message: h.message,
        }
      }),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  async getReport(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: { sprintPublicId: string } | { dateFrom: string; dateTo: string },
  ): Promise<GuidedRetrospectiveSessionsReportJson> {
    assertCanViewGuidedRetrospectiveSessionsReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError(
        "Guided retrospective sessions report is not available for predictive_phases v1.",
      )
    }

    let scope: GuidedRetrospectiveSessionsReportScopeJson
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

    const actionsPerSession = await Promise.all(
      sessions.map((s) =>
        this.actionItemRepository.listBySession(workspacePublicId, projectPublicId, s.sessionPublicId),
      ),
    )

    const members = await this.workspaceMemberRepository.listByWorkspacePublicId(workspacePublicId)
    const memberByUserId = new Map(members.map((m) => [m.userPublicId, m]))

    let sprintNameById = new Map<string, string>()
    if (project.operationalApproach === "scrum") {
      const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
      sprintNameById = new Map(sprints.map((sp) => [sp.sprintPublicId, sp.name]))
    }

    const priorityOrder: Record<GuidedRetrospectiveActionItemState["priority"], number> = {
      high: 0,
      medium: 1,
      low: 2,
    }

    const rows: GuidedRetrospectiveSessionsReportRowJson[] = sessions.map((s, i) => {
      const fac = s.facilitatorUserPublicId ? memberByUserId.get(s.facilitatorUserPublicId) : undefined
      const rawActions = actionsPerSession[i] ?? []
      const actionItems = [...rawActions]
        .sort((a, b) => {
          const pa = priorityOrder[a.priority]
          const pb = priorityOrder[b.priority]
          if (pa !== pb) return pa - pb
          return a.title.localeCompare(b.title, "es", { sensitivity: "base" })
        })
        .map((a) => this.serializeActionItem(a, memberByUserId))

      let transcriptAfterClose: GuidedRetrospectiveSessionsReportRowJson["transcriptAfterClose"] = null
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

      const additiveNotesAfterClose = s.additiveNotesAfterClose.map((n) => {
        const a = memberByUserId.get(n.createdByUserPublicId)
        return {
          noteText: n.noteText,
          createdAt: n.createdAt.toISOString(),
          createdByUserPublicId: n.createdByUserPublicId,
          createdByFullName: a?.fullName ?? null,
          createdByEmailNormalized: a?.emailNormalized ?? null,
        }
      })

      return {
        sessionPublicId: s.sessionPublicId,
        sessionDate: s.sessionDate,
        sessionSlot: s.sessionSlot,
        sprintPublicId: s.sprintPublicId,
        sprintName: s.sprintPublicId ? sprintNameById.get(s.sprintPublicId) ?? null : null,
        retrospectivePeriod: s.retrospectivePeriod,
        operationalApproach: s.operationalApproach,
        operationalTimeZone: s.operationalTimeZone,
        retrospectiveMode: s.retrospectiveMode,
        status: s.status,
        facilitatorUserPublicId: s.facilitatorUserPublicId,
        facilitatorFullName: fac?.fullName ?? null,
        facilitatorEmailNormalized: fac?.emailNormalized ?? null,
        goalSummary: s.goalSummary,
        summary: s.summary,
        agreements: [...s.agreements],
        participantCount: s.participantCount,
        participantWithContributionCount: s.participantWithContributionCount,
        contributionCount: s.contributionCount,
        topicCount: s.topicCount,
        voteRecordCount: s.voteRecordCount,
        sessionVoteStickerTotal: s.sessionVoteStickerTotal,
        templateKey: s.templateKey,
        transcriptAfterClose,
        additiveNotesAfterClose,
        contextHints: s.contextHints ? { ...s.contextHints } : null,
        actionItems,
        actionItemCount: actionItems.length,
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
