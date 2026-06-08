import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { GuidedRefinementSessionRepository } from "../../guided-refinement/persistence/guided-refinement-session.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../../guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementReviewedItemState } from "../../guided-refinement/domain/guided-refinement-reviewed-item.js"
import type { GuidedRefinementSessionState } from "../../guided-refinement/domain/guided-refinement-session.js"
import type { ProjectRuntimeService } from "./project-runtime.service.js"
import { assertCanViewGuidedRefinementSessionsReport } from "../policies/guided-refinement-sessions-report.policy.js"
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

export type GuidedRefinementSessionsReportScopeJson =
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

export type GuidedRefinementSessionsReportReviewerJson = {
  userPublicId: string
  fullName: string | null
  emailNormalized: string | null
}

export type GuidedRefinementSessionsReportItemReviewDetailJson = {
  reviewedItemPublicId: string
  reviewStatus: GuidedRefinementReviewedItemState["reviewStatus"]
  readyForPlanning: boolean
  readyWithObservations: boolean
  observations: string | null
  businessClarifications: string | null
  technicalQuestions: string | null
  dependenciesText: string | null
  risksText: string | null
  estimationStatus: GuidedRefinementReviewedItemState["estimationStatus"]
  sizeConcern: GuidedRefinementReviewedItemState["sizeConcern"]
  notReadyReasons: string[]
  followUpRequired: boolean
  reviewedBy: GuidedRefinementSessionsReportReviewerJson[]
  createdAt: string
  updatedAt: string
}

export type GuidedRefinementSessionsReportItemReviewJson = {
  workItemPublicId: string
  workItemTitle: string
  isSessionCandidate: boolean
  review: GuidedRefinementSessionsReportItemReviewDetailJson | null
}

export type GuidedRefinementSessionsReportRowJson = {
  sessionPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  /** Nombre del sprint cuando el proyecto es Scrum y el id figura en planificación. */
  sprintName: string | null
  operationalApproach: string
  operationalTimeZone: string
  refinementMode: "live" | "async"
  status: "open" | "closed" | "closed_without_decisions"
  facilitatorUserPublicId: string | null
  facilitatorFullName: string | null
  facilitatorEmailNormalized: string | null
  productOwnerUserPublicId: string | null
  productOwnerFullName: string | null
  productOwnerEmailNormalized: string | null
  focusSummary: string | null
  candidateWorkItemPublicIds: string[]
  /** Ítems candidatos y/o con ficha de revisión, con título y detalle persistido. */
  itemReviews: GuidedRefinementSessionsReportItemReviewJson[]
  closeSummary: string | null
  agreements: string[]
  followUps: string[]
  openQuestions: string[]
  additiveNotesAfterClose: string[]
  reviewedItemCount: number
  readyForPlanningCount: number
  pendingCandidateReviewCount: number
  reviewedNotReadyCount: number
  startedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GuidedRefinementSessionsReportJson = {
  workspacePublicId: string
  projectPublicId: string
  projectName: string
  operationalApproach: string
  scope: GuidedRefinementSessionsReportScopeJson
  sessionDateFromInclusive: string
  sessionDateToInclusive: string
  rows: GuidedRefinementSessionsReportRowJson[]
  totalSessionCount: number
}

export class GuidedRefinementSessionsReportService {
  constructor(
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly sessionRepository: GuidedRefinementSessionRepository,
    private readonly reviewedItemRepository: GuidedRefinementReviewedItemRepository,
    private readonly scrumBacklogRepository: ScrumBacklogRepository,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  private serializeReviewDetail(
    rev: GuidedRefinementReviewedItemState,
    memberByUserId: Map<string, WorkspaceMemberState>,
  ): GuidedRefinementSessionsReportItemReviewDetailJson {
    return {
      reviewedItemPublicId: rev.reviewedItemPublicId,
      reviewStatus: rev.reviewStatus,
      readyForPlanning: rev.readyForPlanning,
      readyWithObservations: rev.readyWithObservations,
      observations: rev.observations,
      businessClarifications: rev.businessClarifications,
      technicalQuestions: rev.technicalQuestions,
      dependenciesText: rev.dependenciesText,
      risksText: rev.risksText,
      estimationStatus: rev.estimationStatus,
      sizeConcern: rev.sizeConcern,
      notReadyReasons: [...rev.notReadyReasons],
      followUpRequired: rev.followUpRequired,
      reviewedBy: rev.reviewedByUserPublicIds.map((uid) => {
        const m = memberByUserId.get(uid)
        return {
          userPublicId: uid,
          fullName: m?.fullName ?? null,
          emailNormalized: m?.emailNormalized ?? null,
        }
      }),
      createdAt: rev.createdAt.toISOString(),
      updatedAt: rev.updatedAt.toISOString(),
    }
  }

  private buildItemReviews(
    session: GuidedRefinementSessionState,
    reviews: GuidedRefinementReviewedItemState[],
    memberByUserId: Map<string, WorkspaceMemberState>,
    titleByWorkItemId: Map<string, string>,
  ): GuidedRefinementSessionsReportItemReviewJson[] {
    const cand = new Set(session.candidateWorkItemPublicIds)
    const byWid = new Map(reviews.map((r) => [r.workItemPublicId, r]))
    const ids = new Set<string>(cand)
    for (const r of reviews) ids.add(r.workItemPublicId)
    const sorted = [...ids].sort((a, b) => {
      const ta = titleByWorkItemId.get(a) ?? a
      const tb = titleByWorkItemId.get(b) ?? b
      return ta.localeCompare(tb, "es", { sensitivity: "base" })
    })
    return sorted.map((workItemPublicId) => {
      const rev = byWid.get(workItemPublicId)
      return {
        workItemPublicId,
        workItemTitle: titleByWorkItemId.get(workItemPublicId) ?? "—",
        isSessionCandidate: cand.has(workItemPublicId),
        review: rev ? this.serializeReviewDetail(rev, memberByUserId) : null,
      }
    })
  }

  async getReport(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: { sprintPublicId: string } | { dateFrom: string; dateTo: string },
  ): Promise<GuidedRefinementSessionsReportJson> {
    assertCanViewGuidedRefinementSessionsReport(actor)
    if (actor.workspacePublicId !== workspacePublicId) {
      throw new ProjectRuntimeForbiddenError("Workspace in path does not match authenticated membership.")
    }
    const project = await this.projectRuntimeService.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (project.operationalApproach === "predictive_phases") {
      throw new ProjectRuntimeInvalidInputError("Guided refinement sessions report is not available for predictive_phases v1.")
    }

    let scope: GuidedRefinementSessionsReportScopeJson
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

    const reviewsPerSession = await Promise.all(
      sessions.map((s) =>
        this.reviewedItemRepository.listBySession(workspacePublicId, projectPublicId, s.sessionPublicId),
      ),
    )

    const allWorkItemIds = new Set<string>()
    for (const s of sessions) {
      for (const id of s.candidateWorkItemPublicIds) allWorkItemIds.add(id)
    }
    for (const revs of reviewsPerSession) {
      for (const r of revs) allWorkItemIds.add(r.workItemPublicId)
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

    const rows: GuidedRefinementSessionsReportRowJson[] = sessions.map((s, i) => {
      const fac = s.facilitatorUserPublicId ? memberByUserId.get(s.facilitatorUserPublicId) : undefined
      const po = s.productOwnerUserPublicId ? memberByUserId.get(s.productOwnerUserPublicId) : undefined
      const reviews = reviewsPerSession[i] ?? []
      return {
        sessionPublicId: s.sessionPublicId,
        sessionDate: s.sessionDate,
        sessionSlot: s.sessionSlot,
        sprintPublicId: s.sprintPublicId,
        sprintName: s.sprintPublicId ? sprintNameById.get(s.sprintPublicId) ?? null : null,
        operationalApproach: s.operationalApproach,
        operationalTimeZone: s.operationalTimeZone,
        refinementMode: s.refinementMode,
        status: s.status,
        facilitatorUserPublicId: s.facilitatorUserPublicId,
        facilitatorFullName: fac?.fullName ?? null,
        facilitatorEmailNormalized: fac?.emailNormalized ?? null,
        productOwnerUserPublicId: s.productOwnerUserPublicId,
        productOwnerFullName: po?.fullName ?? null,
        productOwnerEmailNormalized: po?.emailNormalized ?? null,
        focusSummary: s.focusSummary,
        candidateWorkItemPublicIds: [...s.candidateWorkItemPublicIds],
        itemReviews: this.buildItemReviews(s, reviews, memberByUserId, titleByWorkItemId),
        closeSummary: s.closeSummary,
        agreements: [...s.agreements],
        followUps: [...s.followUps],
        openQuestions: [...s.openQuestions],
        additiveNotesAfterClose: [...s.additiveNotesAfterClose],
        reviewedItemCount: s.reviewedItemCount,
        readyForPlanningCount: s.readyForPlanningCount,
        pendingCandidateReviewCount: s.pendingCandidateReviewCount,
        reviewedNotReadyCount: s.reviewedNotReadyCount,
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
