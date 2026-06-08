import { randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  GUIDED_REFINEMENT_DEFAULT_SLOT,
  type GuidedRefinementSessionState,
} from "../domain/guided-refinement-session.js"
import {
  GuidedRefinementConflictError,
  GuidedRefinementNotFoundError,
  GuidedRefinementUnsupportedError,
  GuidedRefinementValidationError,
} from "../domain/guided-refinement.errors.js"
import {
  readyNomenclatureForApproach,
  supportLevelForGuidedRefinement,
} from "../domain/guided-refinement-support-level.js"
import type {
  GuidedRefinementEstimationStatus,
  GuidedRefinementReviewStatus,
  GuidedRefinementReviewedItemState,
  GuidedRefinementSizeConcern,
} from "../domain/guided-refinement-reviewed-item.js"
import {
  todayYmdOperational,
  resolveOperationalTimeZoneIana,
} from "../../daily-alignment/domain/operational-calendar.js"
import type { GuidedRefinementSessionRepository } from "../persistence/guided-refinement-session.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../persistence/guided-refinement-reviewed-item.repository.js"
import {
  assertCanAccessGuidedRefinementRead,
  assertCanCloseGuidedRefinementSession,
  assertCanUpsertGuidedRefinementReview,
} from "../policies/guided-refinement-authorization.policy.js"
import { buildGuidedReadinessSignals } from "./guided-refinement-readiness.builder.js"
import type { GuidedReadinessSignalDto } from "../domain/guided-refinement-readiness-signal.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

export type GuidedRefinementSessionHeaderInput = {
  focusSummary?: string | null
  candidateWorkItemPublicIds?: string[]
  refinementMode?: "live" | "async"
  facilitatorUserPublicId?: string | null
  productOwnerUserPublicId?: string | null
  sprintPublicId?: string | null
}

export type GuidedRefinementReviewUpsertBody = {
  reviewStatus: GuidedRefinementReviewStatus
  readyForPlanning: boolean
  readyWithObservations?: boolean
  observations?: string | null
  businessClarifications?: string | null
  technicalQuestions?: string | null
  dependenciesText?: string | null
  risksText?: string | null
  estimationStatus?: GuidedRefinementEstimationStatus
  sizeConcern?: GuidedRefinementSizeConcern
  notReadyReasons?: string[]
  followUpRequired?: boolean
}

export type GuidedRefinementCloseBody = {
  generalSummary: string
  agreements: string[]
  followUps: string[]
  openQuestions?: string[]
}

export class GuidedRefinementService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly backlogRepository: ScrumBacklogRepository,
    private readonly sessionRepository: GuidedRefinementSessionRepository,
    private readonly reviewedItemRepository: GuidedRefinementReviewedItemRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository,
  ) {}

  async getTodayBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedRefinement>
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    sessionDate: string
    sessionSlot: string
    readyNomenclature: ReturnType<typeof readyNomenclatureForApproach>
    session: GuidedRefinementSessionState | null
  }> {
    assertCanAccessGuidedRefinementRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRefinement(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session =
      supportLevel === "unsupported"
        ? null
        : await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)

    return {
      supportLevel,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      sessionDate,
      sessionSlot,
      readyNomenclature: readyNomenclatureForApproach(project.operationalApproach),
      session,
    }
  }

  async upsertSessionHeader(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRefinementSessionHeaderInput,
  ): Promise<GuidedRefinementSessionState> {
    assertCanUpsertGuidedRefinementReview(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const mode = body.refinementMode ?? "live"
    let session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      refinementMode: mode,
    })

    if (session.status !== "open") {
      throw new GuidedRefinementConflictError("Cannot edit session header after it is closed.")
    }

    const candidates = body.candidateWorkItemPublicIds ?? []
    for (const id of candidates) {
      await this.requireWorkItem(workspacePublicId, projectPublicId, id)
    }

    const now = new Date()
    const sprintPublicId =
      body.sprintPublicId !== undefined
        ? body.sprintPublicId
        : project.operationalApproach === "scrum"
          ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId)
          : null

    const focusSummary =
      body.focusSummary === undefined ? session.focusSummary : this.nullIfEmpty(body.focusSummary)

    const updated = await this.sessionRepository.updateHeaderIfOpen(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        focusSummary,
        candidateWorkItemPublicIds: candidates,
        refinementMode: mode,
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
      throw new GuidedRefinementConflictError("Session is no longer open or was removed.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_refinement_session",
      action: "guided_refinement_session_header_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: updated.sessionPublicId, sessionDate, sessionSlot },
    })

    return updated
  }

  async listReviewedItemsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    session: GuidedRefinementSessionState | null
    items: Array<GuidedRefinementReviewedItemState & { readinessSignals: GuidedReadinessSignalDto[] }>
  }> {
    assertCanAccessGuidedRefinementRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRefinement(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    if (supportLevel === "unsupported") {
      return { session: null, items: [] }
    }

    const session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (!session) {
      return { session: null, items: [] }
    }

    const rows = await this.reviewedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const items: Array<GuidedRefinementReviewedItemState & { readinessSignals: GuidedReadinessSignalDto[] }> = []
    for (const r of rows) {
      const wi = await this.backlogRepository.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        r.workItemPublicId,
      )
      const signals = wi ? buildGuidedReadinessSignals(project.operationalApproach, wi, r) : []
      items.push({ ...r, readinessSignals: signals })
    }
    return { session, items }
  }

  async getReviewedItemForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    session: GuidedRefinementSessionState | null
    review: (GuidedRefinementReviewedItemState & { readinessSignals: GuidedReadinessSignalDto[] }) | null
  }> {
    assertCanAccessGuidedRefinementRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRefinement(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    if (supportLevel === "unsupported") {
      return { session: null, review: null }
    }

    const session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (!session) {
      return { session: null, review: null }
    }

    const review = await this.reviewedItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )
    if (!review) {
      return { session, review: null }
    }
    const wi = await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)
    const readinessSignals = buildGuidedReadinessSignals(project.operationalApproach, wi, review)
    return { session, review: { ...review, readinessSignals } }
  }

  async upsertReviewedItemForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRefinementReviewUpsertBody,
  ): Promise<GuidedRefinementReviewedItemState & { readinessSignals: GuidedReadinessSignalDto[] }> {
    assertCanUpsertGuidedRefinementReview(actor)
    if (body.reviewStatus !== "reviewed" && body.readyForPlanning) {
      throw new GuidedRefinementValidationError("readyForPlanning requires reviewStatus reviewed.")
    }
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)
    await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      refinementMode: "live",
    })

    if (session.status !== "open") {
      throw new GuidedRefinementConflictError("Cannot edit item review after the session is closed.")
    }

    const now = new Date()
    const existing = await this.reviewedItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )

    const reviewedIds = existing ? [...existing.reviewedByUserPublicIds] : []
    if (!reviewedIds.includes(actor.userPublicId)) {
      reviewedIds.push(actor.userPublicId)
    }

    const merged: GuidedRefinementReviewedItemState = {
      reviewedItemPublicId: existing?.reviewedItemPublicId ?? randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      sessionDate,
      workItemPublicId,
      reviewStatus: body.reviewStatus,
      readyForPlanning: body.readyForPlanning,
      readyWithObservations: body.readyWithObservations ?? false,
      observations: this.nullIfEmpty(body.observations),
      businessClarifications: this.nullIfEmpty(body.businessClarifications),
      technicalQuestions: this.nullIfEmpty(body.technicalQuestions),
      dependenciesText: this.nullIfEmpty(body.dependenciesText),
      risksText: this.nullIfEmpty(body.risksText),
      estimationStatus: body.estimationStatus ?? "not_applicable",
      sizeConcern: body.sizeConcern ?? "none",
      notReadyReasons: body.notReadyReasons ?? [],
      followUpRequired: body.followUpRequired ?? false,
      reviewedByUserPublicIds: reviewedIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    if (merged.reviewStatus === "reviewed" && merged.readyForPlanning) {
      const hasConsensusPending = merged.notReadyReasons.includes("consensus_pending")
      if (hasConsensusPending) {
        merged.readyForPlanning = false
      }
    }

    await this.reviewedItemRepository.upsert(merged)
    await this.recomputeAndPersistSessionCounts(session.sessionPublicId, workspacePublicId, projectPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_refinement_session",
      action: "guided_refinement_item_review_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: workItemPublicId },
      previousValue: null,
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        workItemPublicId,
        reviewStatus: merged.reviewStatus,
        readyForPlanning: merged.readyForPlanning,
      },
    })

    const wi = (await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId))!
    const readinessSignals = buildGuidedReadinessSignals(project.operationalApproach, wi, merged)
    return { ...merged, readinessSignals }
  }

  async closeToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRefinementCloseBody,
  ): Promise<GuidedRefinementSessionState> {
    assertCanCloseGuidedRefinementSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        refinementMode: "live",
      })
    }

    if (session.status !== "open") {
      throw new GuidedRefinementConflictError("Session is already closed.")
    }

    const items = await this.reviewedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const reviewedItemCount = items.filter((i) => i.reviewStatus === "reviewed").length
    const readyForPlanningCount = items.filter((i) => i.readyForPlanning).length
    const { pendingCandidateReviewCount, reviewedNotReadyCount } = this.computeSessionReviewCounts(
      items,
      session.candidateWorkItemPublicIds,
    )

    const status: GuidedRefinementSessionState["status"] =
      reviewedItemCount === 0 ? "closed_without_decisions" : "closed"

    const now = new Date()
    const closed = await this.sessionRepository.updateCloseoutAndStatus(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        status,
        closedAt: now,
        closeSummary: body.generalSummary.trim().length > 0 ? body.generalSummary.trim() : null,
        agreements: [...body.agreements],
        followUps: [...body.followUps],
        openQuestions: body.openQuestions ? [...body.openQuestions] : [],
        facilitatorUserPublicId: actor.userPublicId,
        reviewedItemCount,
        readyForPlanningCount,
        pendingCandidateReviewCount,
        reviewedNotReadyCount,
        updatedAt: now,
      },
    )
    if (!closed) {
      throw new GuidedRefinementConflictError("Session could not be closed (race or state).")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_refinement_session",
      action: "guided_refinement_session_closed",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: closed.sessionPublicId,
        status: closed.status,
        reviewedItemCount,
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
  ): Promise<GuidedRefinementSessionState> {
    assertCanCloseGuidedRefinementSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_REFINEMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const trimmed = note.trim()
    if (trimmed.length === 0) {
      throw new GuidedRefinementValidationError("Additive note cannot be empty.")
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedRefinementNotFoundError("Guided refinement session not found for the given date.")
    }
    if (session.status === "open") {
      throw new GuidedRefinementConflictError("Additive notes apply only after the session is closed.")
    }

    const now = new Date()
    const updated = await this.sessionRepository.appendAdditiveNoteAfterClose(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      trimmed,
      now,
    )
    if (!updated) {
      throw new GuidedRefinementNotFoundError("Could not append additive note.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_refinement_session",
      action: "guided_refinement_additive_note_appended",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId },
    })

    return updated
  }

  async listRecentSessions(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedRefinementSessionState[]> {
    assertCanAccessGuidedRefinementRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRefinement(project.operationalApproach) === "unsupported") {
      return []
    }
    const cap = Math.min(Math.max(limit, 1), 500)
    return this.sessionRepository.listRecentForProject(workspacePublicId, projectPublicId, cap)
  }

  async getLatestReviewForWorkItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedRefinement>
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    /** `true` cuando el enfoque permite usar refinamiento guiado (`scrum` / `kanban`). */
    guidedRefinementOperable: boolean
    review: GuidedRefinementReviewedItemState | null
    readinessSignals: GuidedReadinessSignalDto[]
  }> {
    assertCanAccessGuidedRefinementRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRefinement(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const guidedRefinementOperable = supportLevel !== "unsupported"
    await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)
    const review = await this.reviewedItemRepository.findLatestForWorkItemInProject(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!review) {
      return {
        supportLevel,
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        guidedRefinementOperable,
        review: null,
        readinessSignals: [],
      }
    }
    if (!guidedRefinementOperable) {
      return {
        supportLevel,
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        guidedRefinementOperable: false,
        review,
        readinessSignals: [],
      }
    }
    const wi = (await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId))!
    const readinessSignals = buildGuidedReadinessSignals(project.operationalApproach, wi, review)
    return {
      supportLevel,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      guidedRefinementOperable: true,
      review,
      readinessSignals,
    }
  }

  private computeSessionReviewCounts(
    items: GuidedRefinementReviewedItemState[],
    candidateWorkItemPublicIds: string[],
  ): { pendingCandidateReviewCount: number; reviewedNotReadyCount: number } {
    const reviewedNotReadyCount = items.filter((i) => i.reviewStatus === "reviewed" && !i.readyForPlanning).length
    let pendingCandidateReviewCount = 0
    if (candidateWorkItemPublicIds.length > 0) {
      const reviewedSet = new Set(
        items.filter((i) => i.reviewStatus === "reviewed").map((i) => i.workItemPublicId),
      )
      pendingCandidateReviewCount = candidateWorkItemPublicIds.filter((id) => !reviewedSet.has(id)).length
    }
    return { pendingCandidateReviewCount, reviewedNotReadyCount }
  }

  private async recomputeAndPersistSessionCounts(
    sessionPublicId: string,
    workspacePublicId: string,
    projectPublicId: string,
    updatedAt: Date,
  ): Promise<void> {
    const items = await this.reviewedItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const reviewedItemCount = items.filter((i) => i.reviewStatus === "reviewed").length
    const readyForPlanningCount = items.filter((i) => i.readyForPlanning).length

    const sessionRow = await this.sessionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const { pendingCandidateReviewCount, reviewedNotReadyCount } = this.computeSessionReviewCounts(
      items,
      sessionRow?.candidateWorkItemPublicIds ?? [],
    )

    await this.sessionRepository.updateCounts(workspacePublicId, projectPublicId, sessionPublicId, {
      reviewedItemCount,
      readyForPlanningCount,
      pendingCandidateReviewCount,
      reviewedNotReadyCount,
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
      refinementMode: GuidedRefinementSessionState["refinementMode"]
    },
  ): Promise<GuidedRefinementSessionState> {
    const found = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (found) return found

    const session = await this.createSessionDocument(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      ctx.operationalApproach,
      ctx.operationalTimeZone,
      ctx.refinementMode,
    )
    try {
      await this.sessionRepository.insert(session)
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e
      const again = await this.sessionRepository.findByKey(
        workspacePublicId,
        projectPublicId,
        sessionDate,
        sessionSlot,
      )
      if (!again) throw e
      return again
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_refinement_session",
      action: "guided_refinement_session_created_lazy",
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
    refinementMode: GuidedRefinementSessionState["refinementMode"],
  ): Promise<GuidedRefinementSessionState> {
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
      refinementMode,
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "open",
      focusSummary: null,
      candidateWorkItemPublicIds: [],
      closeSummary: null,
      agreements: [],
      followUps: [],
      openQuestions: [],
      additiveNotesAfterClose: [],
      reviewedItemCount: 0,
      readyForPlanningCount: 0,
      pendingCandidateReviewCount: 0,
      reviewedNotReadyCount: 0,
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
      throw new GuidedRefinementValidationError("Invalid session slot.")
    }
  }

  private assertApproachSupportedOrThrow(approach: WorkspaceRuntimeProjectState["operationalApproach"]): void {
    if (supportLevelForGuidedRefinement(approach) === "unsupported") {
      throw new GuidedRefinementUnsupportedError(
        "Guided refinement is not available for predictive_phases projects in v1.",
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
      throw new GuidedRefinementNotFoundError("Operational project not found.")
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
        throw new GuidedRefinementNotFoundError("Operational project not found.")
      }
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new GuidedRefinementUnsupportedError(
          "Guided refinement is only available for scrum or kanban operational projects.",
        )
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
      throw new GuidedRefinementNotFoundError("Work item not found in this project.")
    }
    return row
  }
}
