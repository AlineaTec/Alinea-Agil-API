import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { GuidedReviewSessionRepository } from "../../guided-review/persistence/guided-review-session.repository.js"
import type { GuidedReviewDemonstratedItemRepository } from "../../guided-review/persistence/guided-review-demonstrated-item.repository.js"
import type { GuidedReviewFeedbackRepository } from "../../guided-review/persistence/guided-review-feedback.repository.js"
import type { GuidedReviewDemonstratedItemState } from "../../guided-review/domain/guided-review-demonstrated-item.js"
import type { GuidedReviewFeedbackState } from "../../guided-review/domain/guided-review-feedback.js"
import type { GuidedReviewSessionState } from "../../guided-review/domain/guided-review-session.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewGuidedReviewSessionsReport } from "../policies/guided-review-sessions-report.policy.js"
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

export type GuidedReviewSessionsReportScopeJson =
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

export type GuidedReviewSessionsReportDemonstratedItemJson = {
  workItemPublicId: string
  workItemTitle: string
  demonstrationStatus: GuidedReviewDemonstratedItemState["demonstrationStatus"]
  demoNotes: string | null
  stakeholderFeedbackSummary: string | null
  questionsRaised: string[]
  followUpRequired: boolean
  backlogImpactSuggested: boolean
  priorityImpactSuggested: boolean
  requiresFurtherValidation: boolean
  reviewOutcome: GuidedReviewDemonstratedItemState["reviewOutcome"]
  demonstratedBy: ReportMemberRefJson[]
  createdAt: string
  updatedAt: string
}

export type GuidedReviewSessionsReportFeedbackEntryJson = {
  feedbackEntryPublicId: string
  sourceType: GuidedReviewFeedbackState["sourceType"]
  stakeholderDisplayName: string | null
  feedbackText: string
  feedbackCategory: GuidedReviewFeedbackState["feedbackCategory"]
  affectsWorkItemPublicIds: string[]
  affectsWorkItemTitles: string[]
  isGeneralFeedback: boolean
  suggestedBacklogAction: string | null
  suggestedPriorityImpact: string | null
  marksFollowUp: boolean
  marksBacklogImpact: boolean
  marksPriorityImpact: boolean
  createdByUserPublicId: string
  createdByFullName: string | null
  createdByEmailNormalized: string | null
  createdAt: string
}

export type GuidedReviewSessionsReportRowJson = {
  sessionPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  sprintName: string | null
  operationalApproach: string
  operationalTimeZone: string
  reviewMode: GuidedReviewSessionState["reviewMode"]
  status: GuidedReviewSessionState["status"]
  facilitatorUserPublicId: string | null
  facilitatorFullName: string | null
  facilitatorEmailNormalized: string | null
  productOwnerUserPublicId: string | null
  productOwnerFullName: string | null
  productOwnerEmailNormalized: string | null
  reviewGoalSummary: string | null
  closeSummary: string | null
  agreements: string[]
  followUps: string[]
  stakeholderSummary: string | null
  openQuestionsRemaining: string[]
  methodologicalNotes: string | null
  incrementAssessment: string | null
  sprintGoalAssessment: GuidedReviewSessionState["sprintGoalAssessment"]
  sprintGoalAssessmentExplanation: string | null
  demonstratedItemCount: number
  feedbackCount: number
  backlogImpactCount: number
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
  demonstratedItems: GuidedReviewSessionsReportDemonstratedItemJson[]
  feedbackEntries: GuidedReviewSessionsReportFeedbackEntryJson[]
  startedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GuidedReviewSessionsReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: GuidedReviewSessionsReportScopeJson
  sessionDateFromInclusive: string
  sessionDateToInclusive: string
  rows: GuidedReviewSessionsReportRowJson[]
  totalSessionCount: number
}

export class GuidedReviewSessionsReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sessionRepository: GuidedReviewSessionRepository,
    private readonly demonstratedItemRepository: GuidedReviewDemonstratedItemRepository,
    private readonly feedbackRepository: GuidedReviewFeedbackRepository,
    private readonly scrumBacklogRepository: ScrumBacklogRepository,
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

  private serializeDemonstratedItem(
    item: GuidedReviewDemonstratedItemState,
    workItemTitle: string,
    memberByUserId: Map<string, WorkspaceMemberState>,
  ): GuidedReviewSessionsReportDemonstratedItemJson {
    return {
      workItemPublicId: item.workItemPublicId,
      workItemTitle,
      demonstrationStatus: item.demonstrationStatus,
      demoNotes: item.demoNotes,
      stakeholderFeedbackSummary: item.stakeholderFeedbackSummary,
      questionsRaised: [...item.questionsRaised],
      followUpRequired: item.followUpRequired,
      backlogImpactSuggested: item.backlogImpactSuggested,
      priorityImpactSuggested: item.priorityImpactSuggested,
      requiresFurtherValidation: item.requiresFurtherValidation,
      reviewOutcome: item.reviewOutcome,
      demonstratedBy: item.demonstratedByUserPublicIds.map((uid) => this.memberRef(uid, memberByUserId)),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private serializeFeedback(
    f: GuidedReviewFeedbackState,
    titleByWorkItemId: Map<string, string>,
    memberByUserId: Map<string, WorkspaceMemberState>,
  ): GuidedReviewSessionsReportFeedbackEntryJson {
    const author = memberByUserId.get(f.createdByUserPublicId)
    return {
      feedbackEntryPublicId: f.feedbackEntryPublicId,
      sourceType: f.sourceType,
      stakeholderDisplayName: f.stakeholderDisplayName,
      feedbackText: f.feedbackText,
      feedbackCategory: f.feedbackCategory,
      affectsWorkItemPublicIds: [...f.affectsWorkItemPublicIds],
      affectsWorkItemTitles: f.affectsWorkItemPublicIds.map((id) => titleByWorkItemId.get(id) ?? "—"),
      isGeneralFeedback: f.isGeneralFeedback,
      suggestedBacklogAction: f.suggestedBacklogAction,
      suggestedPriorityImpact: f.suggestedPriorityImpact,
      marksFollowUp: f.marksFollowUp,
      marksBacklogImpact: f.marksBacklogImpact,
      marksPriorityImpact: f.marksPriorityImpact,
      createdByUserPublicId: f.createdByUserPublicId,
      createdByFullName: author?.fullName ?? null,
      createdByEmailNormalized: author?.emailNormalized ?? null,
      createdAt: f.createdAt.toISOString(),
    }
  }

  async getReport(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: { sprintPublicId: string } | { dateFrom: string; dateTo: string },
  ): Promise<GuidedReviewSessionsReportJson> {
    assertCanViewGuidedReviewSessionsReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError("Guided review sessions report is not available for predictive_phases v1.")
    }

    let scope: GuidedReviewSessionsReportScopeJson
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

    const demosPerSession = await Promise.all(
      sessions.map((s) =>
        this.demonstratedItemRepository.listBySession(workspacePublicId, projectPublicId, s.sessionPublicId),
      ),
    )
    const feedbackPerSession = await Promise.all(
      sessions.map((s) => this.feedbackRepository.listBySession(workspacePublicId, projectPublicId, s.sessionPublicId)),
    )

    const allWorkItemIds = new Set<string>()
    for (const demos of demosPerSession) {
      for (const d of demos) allWorkItemIds.add(d.workItemPublicId)
    }
    for (const feeds of feedbackPerSession) {
      for (const f of feeds) {
        for (const id of f.affectsWorkItemPublicIds) allWorkItemIds.add(id)
      }
    }

    const titleEntries = await Promise.all(
      [...allWorkItemIds].map(async (id) => {
        const item = await this.scrumBacklogRepository.findByProjectAndItemId(workspacePublicId, projectPublicId, id)
        const t = item?.title?.trim()
        return [id, t && t.length > 0 ? t : "—"] as const
      }),
    )
    const titleByWorkItemId = new Map<string, string>(titleEntries)

    const members = await this.workspaceMemberRepository.listByWorkspacePublicId(workspacePublicId)
    const memberByUserId = new Map(members.map((m) => [m.userPublicId, m]))

    let sprintNameById = new Map<string, string>()
    if (project.operationalApproach === "scrum") {
      const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
      sprintNameById = new Map(sprints.map((sp) => [sp.sprintPublicId, sp.name]))
    }

    const rows: GuidedReviewSessionsReportRowJson[] = sessions.map((s, i) => {
      const fac = s.facilitatorUserPublicId ? memberByUserId.get(s.facilitatorUserPublicId) : undefined
      const po = s.productOwnerUserPublicId ? memberByUserId.get(s.productOwnerUserPublicId) : undefined
      const demos = demosPerSession[i] ?? []
      const feeds = feedbackPerSession[i] ?? []

      const demonstratedItems = [...demos]
        .sort((a, b) => {
          const ta = titleByWorkItemId.get(a.workItemPublicId) ?? a.workItemPublicId
          const tb = titleByWorkItemId.get(b.workItemPublicId) ?? b.workItemPublicId
          return ta.localeCompare(tb, "es", { sensitivity: "base" })
        })
        .map((d) =>
          this.serializeDemonstratedItem(d, titleByWorkItemId.get(d.workItemPublicId) ?? "—", memberByUserId),
        )

      const feedbackEntries = [...feeds]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((f) => this.serializeFeedback(f, titleByWorkItemId, memberByUserId))

      let transcriptAfterClose: GuidedReviewSessionsReportRowJson["transcriptAfterClose"] = null
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
        operationalApproach: s.operationalApproach,
        operationalTimeZone: s.operationalTimeZone,
        reviewMode: s.reviewMode,
        status: s.status,
        facilitatorUserPublicId: s.facilitatorUserPublicId,
        facilitatorFullName: fac?.fullName ?? null,
        facilitatorEmailNormalized: fac?.emailNormalized ?? null,
        productOwnerUserPublicId: s.productOwnerUserPublicId,
        productOwnerFullName: po?.fullName ?? null,
        productOwnerEmailNormalized: po?.emailNormalized ?? null,
        reviewGoalSummary: s.reviewGoalSummary,
        closeSummary: s.closeSummary,
        agreements: [...s.agreements],
        followUps: [...s.followUps],
        stakeholderSummary: s.stakeholderSummary,
        openQuestionsRemaining: [...s.openQuestionsRemaining],
        methodologicalNotes: s.methodologicalNotes,
        incrementAssessment: s.incrementAssessment,
        sprintGoalAssessment: s.sprintGoalAssessment,
        sprintGoalAssessmentExplanation: s.sprintGoalAssessmentExplanation,
        demonstratedItemCount: s.demonstratedItemCount,
        feedbackCount: s.feedbackCount,
        backlogImpactCount: s.backlogImpactCount,
        transcriptAfterClose,
        additiveNotesAfterClose,
        demonstratedItems,
        feedbackEntries,
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
