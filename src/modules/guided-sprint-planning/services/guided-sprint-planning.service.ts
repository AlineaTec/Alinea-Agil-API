import { randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../../guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { SprintPlanningService } from "../../project-scrum-sprint-planning/services/sprint-planning.service.js"
import { SprintPlanningValidationError } from "../../project-scrum-sprint-planning/domain/sprint-planning.errors.js"
import {
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  todayYmdOperational,
  resolveOperationalTimeZoneIana,
} from "../../daily-alignment/domain/operational-calendar.js"
import {
  GUIDED_SPRINT_PLANNING_DEFAULT_SLOT,
  type GuidedSprintPlanningSessionState,
} from "../domain/guided-sprint-planning-session.js"
import type {
  CapacityConcern,
  ExcludedReason,
  GuidedSprintPlanningCandidateItemState,
} from "../domain/guided-sprint-planning-candidate-item.js"
import type { GuidedSprintPlanningBaselineState } from "../domain/guided-sprint-planning-baseline.js"
import {
  GuidedSprintPlanningCommitApplyError,
  GuidedSprintPlanningConflictError,
  GuidedSprintPlanningNotFoundError,
  GuidedSprintPlanningUnsupportedError,
  GuidedSprintPlanningValidationError,
} from "../domain/guided-sprint-planning.errors.js"
import {
  guidedSprintPlanningOperable,
  planningModeForApproach,
  supportLevelForGuidedSprintPlanning,
} from "../domain/guided-sprint-planning-support-level.js"
import type { GuidedSprintPlanningSessionRepository } from "../persistence/guided-sprint-planning-session.repository.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "../persistence/guided-sprint-planning-candidate-item.repository.js"
import type { GuidedSprintPlanningBaselineRepository } from "../persistence/guided-sprint-planning-baseline.repository.js"
import {
  assertCanAccessGuidedSprintPlanningRead,
  assertCanCloseGuidedSprintPlanningSession,
  assertCanUpsertGuidedSprintPlanningDecision,
} from "../policies/guided-sprint-planning-authorization.policy.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

/** Tipos importables desde refinamiento (candidatos típicos para compromiso). */
const REFINEMENT_SYNC_ITEM_TYPES = new Set<ScrumBacklogItemState["itemType"]>(["user_story", "task", "bug"])

/** Tipos visibles en «todo el backlog abierto» (incluye contenedores; el compromiso sigue validando tipos en cierre). */
const ALL_OPEN_BACKLOG_SYNC_ITEM_TYPES = new Set<ScrumBacklogItemState["itemType"]>([
  "epic",
  "user_story",
  "task",
  "bug",
  "subtask",
])

export type GuidedSprintPlanningCurrentQuery = {
  sprintPublicId?: string
  sessionDate?: string
  sessionSlot?: string
}

export type GuidedSprintPlanningSessionHeaderInput = {
  planningGoalDraft?: string | null
  facilitatorUserPublicId?: string | null
  productOwnerUserPublicId?: string | null
  capacityTotal?: number | null
  capacityUnit?: GuidedSprintPlanningSessionState["capacityUnit"]
  bufferReserved?: number | null
  bufferMode?: GuidedSprintPlanningSessionState["bufferMode"]
  sprintPublicId?: string
}

export type GuidedSprintPlanningCandidateDecisionInput = {
  isCommitted?: boolean
  isExcluded?: boolean
  excludedReason?: ExcludedReason | null
  excludedReasonNotes?: string | null
  riskNotes?: string | null
  dependencyNotes?: string | null
  capacityConcern?: CapacityConcern
  planningDecisionNotes?: string | null
}

export type GuidedSprintPlanningCloseInput = {
  sprintGoalFinal?: string | null
  summary: string
  agreements: string[]
  followUps: string[]
  transcript?: string
}

export class GuidedSprintPlanningService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly backlogRepository: ScrumBacklogRepository,
    private readonly sprintPlanningService: SprintPlanningService,
    private readonly refinementReviewedItemRepository: GuidedRefinementReviewedItemRepository,
    private readonly sessionRepository: GuidedSprintPlanningSessionRepository,
    private readonly candidateItemRepository: GuidedSprintPlanningCandidateItemRepository,
    private readonly baselineRepository: GuidedSprintPlanningBaselineRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository,
  ) {}

  async getCurrentBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedSprintPlanning>
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    guidedSprintPlanningOperable: boolean
    sessionDate: string
    sessionSlot: string
    sprintPublicId: string | null
    session: GuidedSprintPlanningSessionState | null
  }> {
    assertCanAccessGuidedSprintPlanningRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedSprintPlanning(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const operable = guidedSprintPlanningOperable(project.operationalApproach)
    if (!operable) {
      return {
        supportLevel,
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
        guidedSprintPlanningOperable: false,
        sessionDate,
        sessionSlot,
        sprintPublicId: null,
        session: null,
      }
    }

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
    })
    const session = await this.findSessionByAnchor(workspacePublicId, projectPublicId, anchor)

    return {
      supportLevel,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      guidedSprintPlanningOperable: true,
      sessionDate: anchor.sessionDate,
      sessionSlot: anchor.sessionSlot,
      sprintPublicId: anchor.sprintPublicId,
      session,
    }
  }

  async upsertSessionHeader(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    body: GuidedSprintPlanningSessionHeaderInput,
  ): Promise<GuidedSprintPlanningSessionState> {
    assertCanUpsertGuidedSprintPlanningDecision(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
      sprintPublicId: body.sprintPublicId ?? opts.sprintPublicId,
    })

    let session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, anchor, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
    })

    if (session.status !== "open") {
      throw new GuidedSprintPlanningConflictError("Cannot edit session header after it is closed.")
    }

    const now = new Date()
    const updated = await this.sessionRepository.updateHeaderIfOpen(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        planningGoalDraft:
          body.planningGoalDraft === undefined ? session.planningGoalDraft : this.nullIfEmpty(body.planningGoalDraft),
        facilitatorUserPublicId:
          body.facilitatorUserPublicId === undefined
            ? session.facilitatorUserPublicId
            : body.facilitatorUserPublicId,
        productOwnerUserPublicId:
          body.productOwnerUserPublicId === undefined
            ? session.productOwnerUserPublicId
            : body.productOwnerUserPublicId,
        capacityTotal: body.capacityTotal === undefined ? session.capacityTotal : body.capacityTotal,
        capacityUnit: body.capacityUnit === undefined ? session.capacityUnit : body.capacityUnit,
        bufferReserved: body.bufferReserved === undefined ? session.bufferReserved : body.bufferReserved,
        bufferMode: body.bufferMode === undefined ? session.bufferMode : body.bufferMode,
        updatedAt: now,
      },
    )
    if (!updated) {
      throw new GuidedSprintPlanningConflictError("Session is no longer open or was removed.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_sprint_planning_session",
      action: "guided_sprint_planning_session_header_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: updated.sessionPublicId },
    })

    return updated
  }

  async listCandidateItems(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
  ): Promise<{
    session: GuidedSprintPlanningSessionState | null
    items: GuidedSprintPlanningCandidateItemState[]
  }> {
    assertCanAccessGuidedSprintPlanningRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (!guidedSprintPlanningOperable(project.operationalApproach)) {
      return { session: null, items: [] }
    }

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
    })
    const session = await this.findSessionByAnchor(workspacePublicId, projectPublicId, anchor)
    if (!session) {
      return { session: null, items: [] }
    }

    const items = await this.candidateItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    return { session, items }
  }

  async syncCandidateItems(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    mode: "ready_from_refinement" | "all_open_backlog" = "ready_from_refinement",
  ): Promise<{ session: GuidedSprintPlanningSessionState; items: GuidedSprintPlanningCandidateItemState[] }> {
    assertCanUpsertGuidedSprintPlanningDecision(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
    })

    const session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, anchor, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
    })

    if (session.status !== "open") {
      throw new GuidedSprintPlanningConflictError("Cannot sync candidates on a closed session.")
    }

    const backlogItems = await this.listBacklogPoolForPlanningSync(
      project.operationalApproach,
      workspacePublicId,
      projectPublicId,
    )
    const activeItems = backlogItems.filter((i) => this.isActiveBacklogStatusForPlanningSync(i.status))

    const toAdd: ScrumBacklogItemState[] = []
    for (const item of activeItems) {
      if (!this.isPlanifiableBacklogItemType(item.itemType, mode)) continue
      if (mode === "all_open_backlog") {
        toAdd.push(item)
        continue
      }
      const latestReview = await this.refinementReviewedItemRepository.findLatestForWorkItemInProject(
        workspacePublicId,
        projectPublicId,
        item.backlogItemPublicId,
      )
      if (this.shouldIncludeFromRefinementSync(latestReview)) {
        toAdd.push(item)
      }
    }

    const now = new Date()
    for (const item of toAdd) {
      await this.upsertCandidateRow(session, item.backlogItemPublicId, actor.userPublicId, now)
    }

    await this.recomputeSessionCounts(session.sessionPublicId, workspacePublicId, projectPublicId, now)
    const items = await this.candidateItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const refreshed = (await this.sessionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    ))!

    return { session: refreshed, items }
  }

  async upsertCandidateDecision(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    body: GuidedSprintPlanningCandidateDecisionInput,
  ): Promise<GuidedSprintPlanningCandidateItemState> {
    assertCanUpsertGuidedSprintPlanningDecision(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    await this.requireWorkItem(workspacePublicId, projectPublicId, workItemPublicId)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
    })

    const session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, anchor, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
    })

    if (session.status !== "open") {
      throw new GuidedSprintPlanningConflictError("Cannot update decisions on a closed session.")
    }

    const now = new Date()
    let row = await this.candidateItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )

    if (!row) {
      row = await this.upsertCandidateRow(session, workItemPublicId, actor.userPublicId, now)
    }

    const nextCommitted = body.isCommitted ?? row.isCommitted
    const nextExcluded = body.isExcluded ?? row.isExcluded

    if (nextCommitted && nextExcluded) {
      throw new GuidedSprintPlanningValidationError("An item cannot be both committed and excluded.")
    }

    if (nextExcluded && !body.excludedReason && !row.excludedReason) {
      throw new GuidedSprintPlanningValidationError("Excluded items require excludedReason.")
    }

    if (body.excludedReason === "other") {
      const notes = body.excludedReasonNotes ?? row.excludedReasonNotes
      if (!notes || notes.trim().length === 0) {
        throw new GuidedSprintPlanningValidationError("excludedReason 'other' requires excludedReasonNotes.")
      }
    }

    const decisionUsers = new Set(row.commitmentDecisionByUserPublicIds)
    if (body.isCommitted !== undefined || body.isExcluded !== undefined) {
      decisionUsers.add(actor.userPublicId)
    }

    const merged: GuidedSprintPlanningCandidateItemState = {
      ...row,
      isCommitted: nextCommitted,
      isExcluded: nextExcluded,
      excludedReason:
        nextExcluded
          ? (body.excludedReason ?? row.excludedReason)
          : null,
      excludedReasonNotes:
        nextExcluded
          ? this.nullIfEmpty(body.excludedReasonNotes ?? row.excludedReasonNotes)
          : null,
      riskNotes: body.riskNotes === undefined ? row.riskNotes : this.nullIfEmpty(body.riskNotes),
      dependencyNotes:
        body.dependencyNotes === undefined ? row.dependencyNotes : this.nullIfEmpty(body.dependencyNotes),
      capacityConcern: body.capacityConcern ?? row.capacityConcern,
      planningDecisionNotes:
        body.planningDecisionNotes === undefined
          ? row.planningDecisionNotes
          : this.nullIfEmpty(body.planningDecisionNotes),
      commitmentDecisionByUserPublicIds: [...decisionUsers],
      updatedAt: now,
    }

    if (!merged.isExcluded) {
      merged.excludedReason = null
      merged.excludedReasonNotes = null
    }

    if (merged.isCommitted || merged.isExcluded) {
      merged.isCommitted = merged.isCommitted && !merged.isExcluded
    }

    await this.candidateItemRepository.upsert(merged)
    await this.recomputeSessionCounts(session.sessionPublicId, workspacePublicId, projectPublicId, now)
    return merged
  }

  async getCandidateDecision(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
  ): Promise<{
    session: GuidedSprintPlanningSessionState | null
    item: GuidedSprintPlanningCandidateItemState | null
  }> {
    assertCanAccessGuidedSprintPlanningRead(actor)
    const bootstrap = await this.getCurrentBootstrap(actor, workspacePublicId, projectPublicId, opts)
    if (!bootstrap.session) {
      return { session: null, item: null }
    }
    const item = await this.candidateItemRepository.findBySessionAndWorkItem(
      workspacePublicId,
      projectPublicId,
      bootstrap.session.sessionPublicId,
      workItemPublicId,
    )
    return { session: bootstrap.session, item }
  }

  async closeCurrent(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    body: GuidedSprintPlanningCloseInput,
  ): Promise<{
    session: GuidedSprintPlanningSessionState
    baseline: GuidedSprintPlanningBaselineState | null
  }> {
    assertCanCloseGuidedSprintPlanningSession(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_SPRINT_PLANNING_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const anchor = await this.resolveSessionAnchor(project, workspacePublicId, projectPublicId, {
      ...opts,
      sessionDate,
      sessionSlot,
    })

    let session = await this.findSessionByAnchor(workspacePublicId, projectPublicId, anchor)
    if (!session) {
      session = await this.ensureOpenSessionLazy(actor, workspacePublicId, projectPublicId, anchor, {
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
      })
    }

    if (session.status !== "open") {
      throw new GuidedSprintPlanningConflictError("Session is already closed.")
    }

    const items = await this.candidateItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )

    const counts = this.computeItemCounts(items)
    const sprintGoalFinal =
      body.sprintGoalFinal !== undefined
        ? this.nullIfEmpty(body.sprintGoalFinal)
        : this.nullIfEmpty(session.planningGoalDraft)

    const warnings = this.buildPlanningWarnings(session, items, sprintGoalFinal, counts)

    const applySprintPublicId = session.sprintPublicId
    const committedIds = items.filter((i) => i.isCommitted).map((i) => i.workItemPublicId)

    if (project.operationalApproach === "scrum" && applySprintPublicId && committedIds.length > 0) {
      await this.applyCommitmentAtomically(
        actor,
        workspacePublicId,
        projectPublicId,
        applySprintPublicId,
        committedIds,
      )

      if (sprintGoalFinal) {
        try {
          await this.sprintPlanningService.updateSprint(
            workspacePublicId,
            projectPublicId,
            applySprintPublicId,
            { goal: sprintGoalFinal },
          )
        } catch (e) {
          if (e instanceof SprintPlanningValidationError) {
            warnings.push(`sprint_goal_not_updated: ${e.message}`)
          } else {
            throw e
          }
        }
      }
    }

    const baselineEligible =
      (sprintGoalFinal !== null && sprintGoalFinal.length > 0) || counts.committedItemCount > 0

    let baseline: GuidedSprintPlanningBaselineState | null = null
    let baselinePublicId: string | null = null
    let baselineCreated = false

    if (baselineEligible) {
      baseline = this.buildBaseline(session, items, sprintGoalFinal, warnings, actor.userPublicId)
      try {
        await this.baselineRepository.insert(baseline)
        baselinePublicId = baseline.baselinePublicId
        baselineCreated = true
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          baseline = await this.baselineRepository.findBySessionPublicId(
            workspacePublicId,
            projectPublicId,
            session.sessionPublicId,
          )
          baselinePublicId = baseline?.baselinePublicId ?? null
          baselineCreated = baseline !== null
        } else {
          throw e
        }
      }
    } else {
      warnings.push("no_baseline_created: missing sprint goal and committed items")
    }

    const status: GuidedSprintPlanningSessionState["status"] =
      warnings.length > 0
        ? baselineCreated
          ? "closed_with_warnings"
          : "closed_without_baseline"
        : "closed"

    const now = new Date()
    const transcriptAfterClose = this.buildTranscriptAfterClose(body.transcript, actor.userPublicId, now)
    const closed = await this.sessionRepository.updateCloseoutAndStatus(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        status,
        sprintGoalFinal,
        summary: body.summary.trim().length > 0 ? body.summary.trim() : null,
        agreements: [...body.agreements],
        followUps: [...body.followUps],
        planningWarnings: [...warnings],
        baselineCreated,
        baselinePublicId,
        facilitatorUserPublicId: actor.userPublicId,
        candidateItemCount: counts.candidateItemCount,
        committedItemCount: counts.committedItemCount,
        excludedItemCount: counts.excludedItemCount,
        pendingDecisionCount: counts.pendingDecisionCount,
        closedAt: now,
        transcriptAfterClose,
        updatedAt: now,
      },
    )

    if (!closed) {
      throw new GuidedSprintPlanningConflictError("Session could not be closed (race or state).")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_sprint_planning_session",
      action: "guided_sprint_planning_session_closed",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: closed.sessionPublicId,
        status: closed.status,
        committedItemCount: counts.committedItemCount,
        baselineCreated,
      },
    })

    return { session: closed, baseline }
  }

  async appendAdditiveNoteAfterClose(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    note: string,
  ): Promise<GuidedSprintPlanningSessionState> {
    assertCanCloseGuidedSprintPlanningSession(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const trimmed = note.trim()
    if (trimmed.length === 0) {
      throw new GuidedSprintPlanningValidationError("Additive note cannot be empty.")
    }

    const bootstrap = await this.getCurrentBootstrap(actor, workspacePublicId, projectPublicId, opts)
    if (!bootstrap.session) {
      throw new GuidedSprintPlanningNotFoundError("Guided sprint planning session not found.")
    }
    if (bootstrap.session.status === "open") {
      throw new GuidedSprintPlanningConflictError("Additive notes apply only after the session is closed.")
    }

    const now = new Date()
    const updated = await this.sessionRepository.appendAdditiveNoteAfterClose(
      workspacePublicId,
      projectPublicId,
      bootstrap.session.sessionPublicId,
      trimmed,
      now,
    )
    if (!updated) {
      throw new GuidedSprintPlanningNotFoundError("Could not append additive note.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_sprint_planning_session",
      action: "guided_sprint_planning_additive_note_appended",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: bootstrap.session.sessionPublicId },
    })

    return updated
  }

  async upsertTranscriptAfterClose(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery,
    transcript: string,
  ): Promise<GuidedSprintPlanningSessionState> {
    assertCanCloseGuidedSprintPlanningSession(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    this.assertApproachSupportedOrThrow(project.operationalApproach)

    const bootstrap = await this.getCurrentBootstrap(actor, workspacePublicId, projectPublicId, opts)
    if (!bootstrap.session) {
      throw new GuidedSprintPlanningNotFoundError("Guided sprint planning session not found.")
    }
    if (bootstrap.session.status === "open") {
      throw new GuidedSprintPlanningConflictError("Transcript after close applies only after the session is closed.")
    }

    const now = new Date()
    const payload = this.buildTranscriptAfterClose(transcript, actor.userPublicId, now)

    const updated = await this.sessionRepository.upsertTranscriptAfterClose(
      workspacePublicId,
      projectPublicId,
      bootstrap.session.sessionPublicId,
      payload,
      now,
    )
    if (!updated) {
      throw new GuidedSprintPlanningNotFoundError("Could not update transcript after close.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_sprint_planning_session",
      action: "guided_sprint_planning_transcript_after_close_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: bootstrap.session.sessionPublicId,
        cleared: payload === null,
      },
    })

    return updated
  }

  private buildTranscriptAfterClose(
    transcript: string | undefined,
    actorUserPublicId: string,
    now: Date,
  ): GuidedSprintPlanningSessionState["transcriptAfterClose"] {
    if (transcript === undefined) return null
    const trimmed = transcript.trim()
    if (trimmed.length === 0) return null
    return { text: trimmed, updatedAt: now, updatedByUserPublicId: actorUserPublicId }
  }

  async listRecentSessions(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedSprintPlanningSessionState[]> {
    assertCanAccessGuidedSprintPlanningRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (!guidedSprintPlanningOperable(project.operationalApproach)) {
      return []
    }
    const cap = Math.min(Math.max(limit, 1), 500)
    return this.sessionRepository.listRecentForProject(workspacePublicId, projectPublicId, cap)
  }

  async getBaselineForSprint(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<GuidedSprintPlanningBaselineState | null> {
    assertCanAccessGuidedSprintPlanningRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (!guidedSprintPlanningOperable(project.operationalApproach)) {
      return null
    }

    const sprint = await this.sprintPlanningRepository.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    if (!sprint) {
      throw new GuidedSprintPlanningNotFoundError("Sprint not found in this project.")
    }

    return this.baselineRepository.findLatestBySprintPublicId(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
  }

  private async applyCommitmentAtomically(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
    committedIds: string[],
  ): Promise<void> {
    const applied: string[] = []
    try {
      for (const workItemPublicId of committedIds) {
        await this.sprintPlanningService.commitBacklogItemToSprint(
          workspacePublicId,
          projectPublicId,
          sprintPublicId,
          workItemPublicId,
          actor,
        )
        applied.push(workItemPublicId)
      }
    } catch (e) {
      for (const id of applied) {
        try {
          await this.sprintPlanningService.removeBacklogItemFromSprint(
            workspacePublicId,
            projectPublicId,
            sprintPublicId,
            id,
            actor,
          )
        } catch {
          /* best-effort rollback */
        }
      }
      const msg = e instanceof Error ? e.message : "commit_apply_failed"
      const failedId = applied.length < committedIds.length ? committedIds[applied.length]! : null
      throw new GuidedSprintPlanningCommitApplyError(
        `Failed to apply sprint commitment atomically: ${msg}`,
        failedId,
      )
    }
  }

  private buildBaseline(
    session: GuidedSprintPlanningSessionState,
    items: GuidedSprintPlanningCandidateItemState[],
    sprintGoal: string | null,
    warnings: string[],
    createdByUserPublicId: string,
  ): GuidedSprintPlanningBaselineState {
    const committed = items.filter((i) => i.isCommitted)
    const knownRisks = committed
      .map((i) => i.riskNotes?.trim())
      .filter((x): x is string => !!x && x.length > 0)
    const knownDependencies = committed
      .map((i) => i.dependencyNotes?.trim())
      .filter((x): x is string => !!x && x.length > 0)

    return {
      baselinePublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId: session.workspacePublicId,
      projectPublicId: session.projectPublicId,
      sprintPublicId: session.sprintPublicId,
      sprintGoal,
      committedWorkItemPublicIds: committed.map((i) => i.workItemPublicId),
      capacityTotal: session.capacityTotal,
      capacityUnit: session.capacityUnit,
      bufferReserved: session.bufferReserved,
      knownRisks,
      knownDependencies,
      baselineWarnings: [...warnings],
      createdAt: new Date(),
      createdByUserPublicId,
    }
  }

  private buildPlanningWarnings(
    session: GuidedSprintPlanningSessionState,
    items: GuidedSprintPlanningCandidateItemState[],
    sprintGoalFinal: string | null,
    counts: ReturnType<typeof this.computeItemCounts>,
  ): string[] {
    const warnings: string[] = []
    if (!sprintGoalFinal) warnings.push("missing_sprint_goal_final")
    if (session.capacityTotal === null) warnings.push("missing_capacity")
    if (session.bufferReserved === null || session.bufferReserved === 0) {
      warnings.push("missing_or_zero_buffer")
    }
    if (counts.committedItemCount === 0) warnings.push("zero_committed_items")
    if (counts.pendingDecisionCount > 0) {
      warnings.push(`pending_decisions:${counts.pendingDecisionCount}`)
    }
    for (const item of items) {
      if (item.isCommitted && !item.isReadyForPlanning) {
        warnings.push(`committed_not_ready:${item.workItemPublicId}`)
      }
    }
    return warnings
  }

  private computeItemCounts(items: GuidedSprintPlanningCandidateItemState[]): {
    candidateItemCount: number
    committedItemCount: number
    excludedItemCount: number
    pendingDecisionCount: number
  } {
    const candidateItemCount = items.length
    const committedItemCount = items.filter((i) => i.isCommitted).length
    const excludedItemCount = items.filter((i) => i.isExcluded).length
    const pendingDecisionCount = items.filter((i) => !i.isCommitted && !i.isExcluded).length
    return { candidateItemCount, committedItemCount, excludedItemCount, pendingDecisionCount }
  }

  private async recomputeSessionCounts(
    sessionPublicId: string,
    workspacePublicId: string,
    projectPublicId: string,
    updatedAt: Date,
  ): Promise<void> {
    const items = await this.candidateItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const counts = this.computeItemCounts(items)
    await this.sessionRepository.updateCounts(workspacePublicId, projectPublicId, sessionPublicId, {
      ...counts,
      updatedAt,
    })
  }

  private async upsertCandidateRow(
    session: GuidedSprintPlanningSessionState,
    workItemPublicId: string,
    _actorUserPublicId: string,
    now: Date,
  ): Promise<GuidedSprintPlanningCandidateItemState> {
    const latestReview = await this.refinementReviewedItemRepository.findLatestForWorkItemInProject(
      session.workspacePublicId,
      session.projectPublicId,
      workItemPublicId,
    )

    const existing = await this.candidateItemRepository.findBySessionAndWorkItem(
      session.workspacePublicId,
      session.projectPublicId,
      session.sessionPublicId,
      workItemPublicId,
    )

    if (existing) return existing

    const row: GuidedSprintPlanningCandidateItemState = {
      candidateItemPublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId: session.workspacePublicId,
      projectPublicId: session.projectPublicId,
      sprintPublicId: session.sprintPublicId,
      workItemPublicId,
      isReadyForPlanning: latestReview?.readyForPlanning ?? false,
      isCommitted: false,
      isExcluded: false,
      excludedReason: null,
      excludedReasonNotes: null,
      riskNotes: latestReview?.risksText ?? null,
      dependencyNotes: latestReview?.dependenciesText ?? null,
      capacityConcern: "none",
      planningDecisionNotes: null,
      commitmentDecisionByUserPublicIds: [],
      createdAt: now,
      updatedAt: now,
    }

    await this.candidateItemRepository.upsert(row)
    return row
  }

  private async ensureOpenSessionLazy(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    anchor: SessionAnchor,
    ctx: {
      operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
      operationalTimeZone: string
    },
  ): Promise<GuidedSprintPlanningSessionState> {
    const found = await this.findSessionByAnchor(workspacePublicId, projectPublicId, anchor)
    if (found) return found

    const session = await this.createSessionDocument(
      workspacePublicId,
      projectPublicId,
      anchor,
      ctx.operationalApproach,
      ctx.operationalTimeZone,
    )

    try {
      await this.sessionRepository.insert(session)
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e
      const again = await this.findSessionByAnchor(workspacePublicId, projectPublicId, anchor)
      if (!again) throw e
      return again
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_sprint_planning_session",
      action: "guided_sprint_planning_session_created_lazy",
      actorUserPublicId: actor.userPublicId,
      occurredAt: new Date(),
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        sprintPublicId: session.sprintPublicId,
        sessionDate: session.sessionDate,
      },
    })

    return session
  }

  private async createSessionDocument(
    workspacePublicId: string,
    projectPublicId: string,
    anchor: SessionAnchor,
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"],
    operationalTimeZone: string,
  ): Promise<GuidedSprintPlanningSessionState> {
    const now = new Date()
    return {
      sessionPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      sprintPublicId: anchor.sprintPublicId,
      sessionDate: anchor.sessionDate,
      sessionSlot: anchor.sessionSlot,
      operationalApproach,
      operationalTimeZone,
      planningMode: planningModeForApproach(operationalApproach),
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "open",
      planningGoalDraft: null,
      sprintGoalFinal: null,
      summary: null,
      agreements: [],
      followUps: [],
      capacityTotal: null,
      capacityUnit: null,
      bufferReserved: null,
      bufferMode: null,
      candidateItemCount: 0,
      committedItemCount: 0,
      excludedItemCount: 0,
      pendingDecisionCount: 0,
      planningWarnings: [],
      baselineCreated: false,
      baselinePublicId: null,
      additiveNotesAfterClose: [],
      transcriptAfterClose: null,
      startedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  private async findSessionByAnchor(
    workspacePublicId: string,
    projectPublicId: string,
    anchor: SessionAnchor,
  ): Promise<GuidedSprintPlanningSessionState | null> {
    if (anchor.sprintPublicId) {
      return this.sessionRepository.findBySprintPublicId(
        workspacePublicId,
        projectPublicId,
        anchor.sprintPublicId,
      )
    }
    return this.sessionRepository.findByFlowKey(
      workspacePublicId,
      projectPublicId,
      anchor.sessionDate,
      anchor.sessionSlot,
    )
  }

  private async resolveSessionAnchor(
    project: WorkspaceRuntimeProjectState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: GuidedSprintPlanningCurrentQuery & { sessionDate: string; sessionSlot: string },
  ): Promise<SessionAnchor> {
    if (project.operationalApproach === "scrum") {
      const sprintPublicId =
        opts.sprintPublicId?.trim() ||
        (await this.resolvePlanningSprintPublicId(workspacePublicId, projectPublicId))
      if (!sprintPublicId) {
        throw new GuidedSprintPlanningNotFoundError(
          "No hay ningún sprint en planificación en este proyecto. Crea uno en Planificación de sprints o selecciónalo en el desplegable de Sprint Planning guiada.",
        )
      }
      const sprint = await this.sprintPlanningRepository.findSprintByPublicId(
        workspacePublicId,
        projectPublicId,
        sprintPublicId,
      )
      if (!sprint) {
        throw new GuidedSprintPlanningNotFoundError("Sprint not found in this project.")
      }
      return {
        sprintPublicId,
        sessionDate: opts.sessionDate,
        sessionSlot: opts.sessionSlot,
      }
    }

    return {
      sprintPublicId: null,
      sessionDate: opts.sessionDate,
      sessionSlot: opts.sessionSlot,
    }
  }

  private isPlanifiableBacklogItemType(
    itemType: ScrumBacklogItemState["itemType"],
    mode: "ready_from_refinement" | "all_open_backlog",
  ): boolean {
    const allowed = mode === "all_open_backlog" ? ALL_OPEN_BACKLOG_SYNC_ITEM_TYPES : REFINEMENT_SYNC_ITEM_TYPES
    return allowed.has(itemType)
  }

  /** Ítems cerrados (`done`) no entran al pool de planning. */
  private isActiveBacklogStatusForPlanningSync(status: ScrumBacklogItemState["status"]): boolean {
    return status === "open" || status === "in_progress"
  }

  /**
   * OQ-GPLAN-6: sync desde refinamiento incluye ítems revisados aunque no estén marcados listos;
   * la readiness queda en `isReadyForPlanning` del candidato (advertencia, no bloqueo).
   */
  private shouldIncludeFromRefinementSync(
    latestReview: Awaited<
      ReturnType<GuidedRefinementReviewedItemRepository["findLatestForWorkItemInProject"]>
    >,
  ): boolean {
    return latestReview?.reviewStatus === "reviewed"
  }

  private async listBacklogPoolForPlanningSync(
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"],
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ScrumBacklogItemState[]> {
    if (operationalApproach === "kanban") {
      const [backlog, board] = await Promise.all([
        this.backlogRepository.listKanbanBacklogItems(workspacePublicId, projectPublicId),
        this.backlogRepository.listKanbanBoardItems(workspacePublicId, projectPublicId),
      ])
      const byId = new Map<string, ScrumBacklogItemState>()
      for (const item of [...backlog, ...board]) {
        byId.set(item.backlogItemPublicId, item)
      }
      return [...byId.values()]
    }
    return this.backlogRepository.listByProject(workspacePublicId, projectPublicId)
  }

  private async resolvePlanningSprintPublicId(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<string | null> {
    const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
    const planning = sprints.filter((s) => s.status === "planning")
    if (planning.length === 0) return null
    planning.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return planning[0]!.sprintPublicId
  }

  private assertSlot(sessionSlot: string): void {
    if (!/^[a-z0-9_-]{1,32}$/.test(sessionSlot)) {
      throw new GuidedSprintPlanningValidationError("Invalid session slot.")
    }
  }

  private assertApproachSupportedOrThrow(approach: WorkspaceRuntimeProjectState["operationalApproach"]): void {
    if (!guidedSprintPlanningOperable(approach)) {
      throw new GuidedSprintPlanningUnsupportedError(
        "Guided sprint planning is not available for predictive_phases projects in v1.",
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
      throw new ProjectRuntimeNotFoundError()
    }
    return row
  }

  private async requireWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ): Promise<ScrumBacklogItemState> {
    const item = await this.backlogRepository.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!item) {
      throw new GuidedSprintPlanningNotFoundError("Work item not found in this project.")
    }
    return item
  }
}

type SessionAnchor = {
  sprintPublicId: string | null
  sessionDate: string
  sessionSlot: string
}
