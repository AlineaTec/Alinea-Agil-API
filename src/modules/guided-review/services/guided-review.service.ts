import { randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  GUIDED_REVIEW_DEFAULT_SLOT,
  type GuidedReviewSessionState,
} from "../domain/guided-review-session.js"
import {
  GuidedReviewConflictError,
  GuidedReviewNotFoundError,
  GuidedReviewUnsupportedError,
  GuidedReviewValidationError,
} from "../domain/guided-review.errors.js"
import { supportLevelForGuidedReview } from "../domain/guided-review-support-level.js"
import type { GuidedReviewDemonstratedItemState } from "../domain/guided-review-demonstrated-item.js"
import type { GuidedReviewFeedbackState } from "../domain/guided-review-feedback.js"
import {
  todayYmdOperational,
  resolveOperationalTimeZoneIana,
} from "../../daily-alignment/domain/operational-calendar.js"
import type { GuidedReviewSessionRepository } from "../persistence/guided-review-session.repository.js"
import type { GuidedReviewDemonstratedItemRepository } from "../persistence/guided-review-demonstrated-item.repository.js"
import type { GuidedReviewFeedbackRepository } from "../persistence/guided-review-feedback.repository.js"
import {
  assertCanAccessGuidedReviewRead,
  assertCanCloseGuidedReviewSession,
  assertCanUpsertGuidedReviewContent,
} from "../policies/guided-review-authorization.policy.js"
import {
  GUIDED_REVIEW_MAX_LIST_ITEMS,
  GUIDED_REVIEW_MAX_LIST_STRING,
} from "../domain/guided-review-limits.js"
import type { z } from "zod"
import {
  guidedReviewCloseBodySchema,
  guidedReviewDemonstratedItemBodySchema,
  guidedReviewFeedbackBodySchema,
  guidedReviewSessionHeaderBodySchema,
} from "../validation/guided-review-http.schemas.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

export type GuidedReviewSessionHeaderInput = z.infer<typeof guidedReviewSessionHeaderBodySchema>
export type GuidedReviewDemonstratedItemBody = z.infer<typeof guidedReviewDemonstratedItemBodySchema>
export type GuidedReviewFeedbackBody = z.infer<typeof guidedReviewFeedbackBodySchema>
export type GuidedReviewCloseBody = z.infer<typeof guidedReviewCloseBodySchema>

export class GuidedReviewService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly backlogRepository: ScrumBacklogRepository,
    private readonly sessionRepository: GuidedReviewSessionRepository,
    private readonly demonstratedItemRepository: GuidedReviewDemonstratedItemRepository,
    private readonly feedbackRepository: GuidedReviewFeedbackRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository,
  ) {}

  async getTodayBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedReview>
    guidedReviewOperable: boolean
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    sessionDate: string
    sessionSlot: string
    session: GuidedReviewSessionState | null
  }> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedReview(project.operationalApproach)
    const guidedReviewOperable = supportLevel !== "unsupported"
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = guidedReviewOperable
      ? await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
      : null

    return {
      supportLevel,
      guidedReviewOperable,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      sessionDate,
      sessionSlot,
      session,
    }
  }

  async upsertSessionHeader(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedReviewSessionHeaderInput,
  ): Promise<GuidedReviewSessionState> {
    assertCanUpsertGuidedReviewContent(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const mode = body.reviewMode ?? "live"
    let session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      reviewMode: mode,
    })

    if (session.status !== "open") {
      throw new GuidedReviewConflictError("Cannot edit session header after it is closed.")
    }

    const sprintPublicId =
      body.sprintPublicId !== undefined
        ? body.sprintPublicId
        : project.operationalApproach === "scrum"
          ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId)
          : null

    const reviewGoalSummary =
      body.reviewGoalSummary === undefined ? session.reviewGoalSummary : this.nullIfEmpty(body.reviewGoalSummary)

    const now = new Date()
    const updated = await this.sessionRepository.updateHeaderIfOpen(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        reviewGoalSummary,
        reviewMode: mode,
        facilitatorUserPublicId:
          body.facilitatorUserPublicId === undefined ? session.facilitatorUserPublicId : body.facilitatorUserPublicId,
        productOwnerUserPublicId:
          body.productOwnerUserPublicId === undefined
            ? session.productOwnerUserPublicId
            : body.productOwnerUserPublicId,
        sprintPublicId: sprintPublicId ?? null,
        updatedAt: now,
      },
    )
    if (!updated) {
      throw new GuidedReviewConflictError("Session is no longer open or was removed.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_session_header_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: updated.sessionPublicId, sessionDate, sessionSlot },
    })

    return updated
  }

  async listDemonstratedItemsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ session: GuidedReviewSessionState | null; items: GuidedReviewDemonstratedItemState[] }> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    if (supportLevelForGuidedReview(project.operationalApproach) === "unsupported") {
      return { session: null, items: [] }
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, items: [] }

    const items = await this.demonstratedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    return { session, items }
  }

  async getDemonstratedItemForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ session: GuidedReviewSessionState | null; item: GuidedReviewDemonstratedItemState | null }> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    if (supportLevelForGuidedReview(project.operationalApproach) === "unsupported") {
      return { session: null, item: null }
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, item: null }

    const item = await this.demonstratedItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )
    return { session, item }
  }

  async upsertDemonstratedItemForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedReviewDemonstratedItemBody,
  ): Promise<GuidedReviewDemonstratedItemState> {
    assertCanUpsertGuidedReviewContent(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      reviewMode: "live",
    })

    if (session.status !== "open") {
      throw new GuidedReviewConflictError("Cannot edit demonstrated items after the session is closed.")
    }

    const now = new Date()
    const existing = await this.demonstratedItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )

    const presenterIds = body.demonstratedByUserPublicIds ?? existing?.demonstratedByUserPublicIds ?? []
    const mergedPresenters = [...new Set([...presenterIds, actor.userPublicId])]

    const merged: GuidedReviewDemonstratedItemState = {
      demonstratedItemPublicId: existing?.demonstratedItemPublicId ?? randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      sessionDate,
      workItemPublicId,
      demonstrationStatus: body.demonstrationStatus,
      demonstratedByUserPublicIds: mergedPresenters,
      demoNotes: body.demoNotes === undefined ? existing?.demoNotes ?? null : this.nullIfEmpty(body.demoNotes),
      stakeholderFeedbackSummary:
        body.stakeholderFeedbackSummary === undefined
          ? existing?.stakeholderFeedbackSummary ?? null
          : this.nullIfEmpty(body.stakeholderFeedbackSummary),
      questionsRaised: body.questionsRaised ?? existing?.questionsRaised ?? [],
      followUpRequired: body.followUpRequired ?? existing?.followUpRequired ?? false,
      backlogImpactSuggested: body.backlogImpactSuggested ?? existing?.backlogImpactSuggested ?? false,
      priorityImpactSuggested: body.priorityImpactSuggested ?? existing?.priorityImpactSuggested ?? false,
      requiresFurtherValidation: body.requiresFurtherValidation ?? existing?.requiresFurtherValidation ?? false,
      reviewOutcome:
        body.reviewOutcome === undefined ? existing?.reviewOutcome ?? null : (body.reviewOutcome ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await this.demonstratedItemRepository.upsert(merged)
    await this.recomputeAndPersistSessionCounts(session.sessionPublicId, workspacePublicId, projectPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_demonstrated_item_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: workItemPublicId },
      previousValue: null,
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        workItemPublicId,
        demonstrationStatus: merged.demonstrationStatus,
      },
    })

    return merged
  }

  async listFeedbackForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ session: GuidedReviewSessionState | null; feedback: GuidedReviewFeedbackState[] }> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    if (supportLevelForGuidedReview(project.operationalApproach) === "unsupported") {
      return { session: null, feedback: [] }
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, feedback: [] }

    const feedback = await this.feedbackRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    return { session, feedback }
  }

  async appendFeedbackForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedReviewFeedbackBody,
  ): Promise<GuidedReviewFeedbackState> {
    assertCanUpsertGuidedReviewContent(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      reviewMode: "live",
    })

    if (session.status !== "open") {
      throw new GuidedReviewConflictError("Cannot add feedback after the session is closed.")
    }

    const ids = body.affectsWorkItemPublicIds ?? []
    for (const wid of ids) {
      await this.requireWorkItem(workspacePublicId, projectPublicId, wid)
    }

    const isGeneralFeedback = ids.length === 0
    const now = new Date()

    const row: GuidedReviewFeedbackState = {
      feedbackEntryPublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      sourceType: body.sourceType,
      stakeholderDisplayName:
        body.stakeholderDisplayName === undefined
          ? null
          : this.nullIfEmpty(body.stakeholderDisplayName),
      feedbackText: body.feedbackText.trim(),
      feedbackCategory: body.feedbackCategory,
      affectsWorkItemPublicIds: [...ids],
      isGeneralFeedback,
      suggestedBacklogAction:
        body.suggestedBacklogAction === undefined ? null : this.nullIfEmpty(body.suggestedBacklogAction),
      suggestedPriorityImpact:
        body.suggestedPriorityImpact === undefined ? null : this.nullIfEmpty(body.suggestedPriorityImpact),
      marksFollowUp: body.marksFollowUp ?? false,
      marksBacklogImpact: body.marksBacklogImpact ?? false,
      marksPriorityImpact: body.marksPriorityImpact ?? false,
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
    }

    await this.feedbackRepository.insert(row)
    await this.recomputeAndPersistSessionCounts(session.sessionPublicId, workspacePublicId, projectPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_feedback_appended",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        feedbackEntryPublicId: row.feedbackEntryPublicId,
        isGeneralFeedback: row.isGeneralFeedback,
      },
    })

    return row
  }

  async closeToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedReviewCloseBody,
  ): Promise<GuidedReviewSessionState> {
    assertCanCloseGuidedReviewSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        reviewMode: "live",
      })
    }

    if (session.status !== "open") {
      throw new GuidedReviewConflictError("Session is already closed.")
    }

    this.assertClosePayload(body)

    let sprintGoalAssessment = body.sprintGoalAssessment ?? null
    let sprintGoalAssessmentExplanation = body.sprintGoalAssessmentExplanation ?? null
    if (project.operationalApproach === "kanban" && sprintGoalAssessment == null) {
      sprintGoalAssessment = "not_applicable"
      sprintGoalAssessmentExplanation = null
    }

    if (sprintGoalAssessment === "partially_achieved") {
      const ex = (sprintGoalAssessmentExplanation ?? "").trim()
      if (ex.length === 0) {
        throw new GuidedReviewValidationError("sprint_goal_assessment_explanation_required_for_partially_achieved")
      }
    }

    const demos = await this.demonstratedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const feedbackRows = await this.feedbackRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )

    const demonstratedItemCount = demos.length
    const feedbackCount = feedbackRows.length
    const backlogImpactCount = this.countBacklogImpactEntities(demos, feedbackRows)

    const status: GuidedReviewSessionState["status"] =
      demonstratedItemCount === 0 && feedbackCount === 0 ? "closed_without_decisions" : "closed"

    const now = new Date()
    const closed = await this.sessionRepository.updateCloseoutAndStatus(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        status,
        closedAt: now,
        closeSummary: this.nullIfEmpty(body.generalSummary),
        agreements: [...body.agreements],
        followUps: [...body.followUps],
        stakeholderSummary: this.nullIfEmpty(body.stakeholderSummary),
        openQuestionsRemaining: body.openQuestionsRemaining ? [...body.openQuestionsRemaining] : [],
        methodologicalNotes: this.nullIfEmpty(body.methodologicalNotes),
        incrementAssessment: this.nullIfEmpty(body.incrementAssessment),
        sprintGoalAssessment,
        sprintGoalAssessmentExplanation: this.nullIfEmpty(sprintGoalAssessmentExplanation),
        facilitatorUserPublicId: actor.userPublicId,
        demonstratedItemCount,
        feedbackCount,
        backlogImpactCount,
        updatedAt: now,
      },
    )
    if (!closed) {
      throw new GuidedReviewConflictError("Session could not be closed (race or state).")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_session_closed",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: closed.sessionPublicId,
        status: closed.status,
        demonstratedItemCount,
        feedbackCount,
      },
    })

    return closed
  }

  async appendAdditiveNoteAfterClose(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    note: string,
  ): Promise<GuidedReviewSessionState> {
    assertCanCloseGuidedReviewSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const trimmed = note.trim()
    if (trimmed.length === 0) {
      throw new GuidedReviewValidationError("Additive note cannot be empty.")
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedReviewNotFoundError("Guided review session not found for the given date.")
    }
    if (session.status === "open") {
      throw new GuidedReviewConflictError("Additive notes apply only after the session is closed.")
    }

    const now = new Date()
    const updated = await this.sessionRepository.appendAdditiveNoteAfterClose(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      { noteText: trimmed, createdByUserPublicId: actor.userPublicId, createdAt: now },
      now,
    )
    if (!updated) {
      throw new GuidedReviewNotFoundError("Could not append additive note.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_additive_note_appended",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId },
    })

    return updated
  }

  async upsertTranscriptAfterClose(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    transcript: string,
  ): Promise<GuidedReviewSessionState> {
    assertCanCloseGuidedReviewSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REVIEW_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedReviewNotFoundError("Guided review session not found for the given date.")
    }
    if (session.status === "open") {
      throw new GuidedReviewConflictError("Transcript after close applies only after the session is closed.")
    }

    const now = new Date()
    const trimmed = transcript.trim()
    const payload =
      trimmed.length === 0
        ? null
        : { text: trimmed, updatedAt: now, updatedByUserPublicId: actor.userPublicId }

    const updated = await this.sessionRepository.upsertTranscriptAfterClose(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      payload,
      now,
    )
    if (!updated) {
      throw new GuidedReviewNotFoundError("Could not update transcript after close.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_transcript_after_close_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, cleared: payload === null },
    })

    return updated
  }

  async listRecentSessions(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedReviewSessionState[]> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedReview(project.operationalApproach) === "unsupported") {
      return []
    }
    const cap = Math.min(Math.max(limit, 1), 500)
    return this.sessionRepository.listRecentForProject(workspacePublicId, projectPublicId, cap)
  }

  async getLatestDemonstrationForWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedReview>
    guidedReviewOperable: boolean
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    session: GuidedReviewSessionState | null
    demonstratedItem: GuidedReviewDemonstratedItemState | null
  }> {
    assertCanAccessGuidedReviewRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedReview(project.operationalApproach)
    const guidedReviewOperable = supportLevel !== "unsupported"
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)

    const latest = await this.demonstratedItemRepository.findLatestForWorkItemInProject(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!latest) {
      return {
        supportLevel,
        guidedReviewOperable,
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        session: null,
        demonstratedItem: null,
      }
    }
    const session = await this.sessionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      latest.sessionPublicId,
    )
    return {
      supportLevel,
      guidedReviewOperable,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      session,
      demonstratedItem: latest.item,
    }
  }

  private countBacklogImpactEntities(
    demos: GuidedReviewDemonstratedItemState[],
    feedback: GuidedReviewFeedbackState[],
  ): number {
    let n = 0
    for (const d of demos) {
      if (d.backlogImpactSuggested || d.priorityImpactSuggested) n++
    }
    for (const f of feedback) {
      if (f.marksBacklogImpact || f.marksPriorityImpact) n++
    }
    return n
  }

  private assertClosePayload(body: GuidedReviewCloseBody): void {
    const checkList = (xs: string[], label: string) => {
      if (xs.length > GUIDED_REVIEW_MAX_LIST_ITEMS) {
        throw new GuidedReviewValidationError(`${label} list too long.`)
      }
      for (const s of xs) {
        if (s.length > GUIDED_REVIEW_MAX_LIST_STRING) {
          throw new GuidedReviewValidationError(`${label} entry too long.`)
        }
      }
    }
    checkList(body.agreements, "agreements")
    checkList(body.followUps, "followUps")
    if (body.openQuestionsRemaining) checkList(body.openQuestionsRemaining, "openQuestionsRemaining")
  }

  private async recomputeAndPersistSessionCounts(
    sessionPublicId: string,
    workspacePublicId: string,
    projectPublicId: string,
    updatedAt: Date,
  ): Promise<void> {
    const demos = await this.demonstratedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const feedbackRows = await this.feedbackRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    await this.sessionRepository.updateCounts(workspacePublicId, projectPublicId, sessionPublicId, {
      demonstratedItemCount: demos.length,
      feedbackCount: feedbackRows.length,
      backlogImpactCount: this.countBacklogImpactEntities(demos, feedbackRows),
      updatedAt,
    })
  }

  private async ensureOpenSessionLazy(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
    ctx: {
      operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
      operationalTimeZone: string
      reviewMode: GuidedReviewSessionState["reviewMode"]
    },
  ): Promise<GuidedReviewSessionState> {
    const found = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (found) return found

    const session = await this.createSessionDocument(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      ctx.operationalApproach,
      ctx.operationalTimeZone,
      ctx.reviewMode,
    )
    try {
      await this.sessionRepository.insert(session)
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e
      const again = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
      if (!again) throw e
      return again
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_review_session",
      action: "guided_review_session_created_lazy",
      actorUserPublicId: actor.userPublicId,
      occurredAt: new Date(),
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, sessionDate, sessionSlot },
    })
    return session
  }

  private async createSessionDocument(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"],
    operationalTimeZone: string,
    reviewMode: GuidedReviewSessionState["reviewMode"],
  ): Promise<GuidedReviewSessionState> {
    const now = new Date()
    const sprintPublicId =
      operationalApproach === "scrum" ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId) : null

    return {
      sessionPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      sprintPublicId,
      operationalApproach,
      operationalTimeZone,
      reviewMode,
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "open",
      reviewGoalSummary: null,
      closeSummary: null,
      agreements: [],
      followUps: [],
      stakeholderSummary: null,
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: null,
      sprintGoalAssessment: null,
      sprintGoalAssessmentExplanation: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 0,
      feedbackCount: 0,
      backlogImpactCount: 0,
      startedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  private async resolveActiveSprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<string | null> {
    const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
    const active = sprints.filter((s) => s.status === "active")
    if (active.length === 0) return null
    active.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return active[0]!.sprintPublicId
  }

  private assertSlot(sessionSlot: string): void {
    if (!/^[a-z0-9_-]{1,32}$/.test(sessionSlot)) {
      throw new GuidedReviewValidationError("Invalid session slot.")
    }
  }

  private assertWritableApproach(approach: WorkspaceRuntimeProjectState["operationalApproach"]): void {
    if (supportLevelForGuidedReview(approach) === "unsupported") {
      throw new GuidedReviewUnsupportedError(
        "Guided review is not operable for predictive_phases projects in v1 (contracts-docs guided-review OQ-GREV-10).",
      )
    }
  }

  private nullIfEmpty(v: string | null | undefined): string | null {
    if (v === undefined || v === null) return null
    const t = v.trim()
    return t.length === 0 ? null : t
  }

  private async requireWorkspaceRuntimeProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState> {
    const row = await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!row) {
      throw new GuidedReviewNotFoundError("Operational project not found.")
    }
    return row
  }

  private async requireScrumOrKanbanProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState> {
    try {
      return await this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    } catch (e) {
      if (e instanceof ProjectRuntimeNotFoundError) {
        throw new GuidedReviewNotFoundError("Operational project not found.")
      }
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new GuidedReviewUnsupportedError("Guided review requires scrum or kanban operational projects for writes.")
      }
      throw e
    }
  }

  private async requireWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    const row = await this.backlogRepository.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!row) {
      throw new GuidedReviewNotFoundError("Work item not found in this project.")
    }
    return row
  }
}
