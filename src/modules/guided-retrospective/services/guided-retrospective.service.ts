import { randomInt, randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import {
  ProjectRuntimeInvalidInputError,
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
  GUIDED_RETROSPECTIVE_DEFAULT_SLOT,
  type GuidedRetrospectiveSessionState,
  type GuidedRetrospectiveAdditiveNote,
} from "../domain/guided-retrospective-session.js"
import {
  GuidedRetrospectiveConflictError,
  GuidedRetrospectiveForbiddenError,
  GuidedRetrospectiveNotFoundError,
  GuidedRetrospectiveUnsupportedError,
  GuidedRetrospectiveValidationError,
} from "../domain/guided-retrospective.errors.js"
import { supportLevelForGuidedRetrospective } from "../domain/guided-retrospective-support-level.js"
import {
  getRetroTemplateOrThrow,
  isValidTemplateColumn,
} from "../domain/guided-retrospective-template-catalog.js"
import type { GuidedRetrospectiveSessionRepository } from "../persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveTopicRepository } from "../persistence/guided-retrospective-topic.repository.js"
import type { GuidedRetrospectiveContributionRepository } from "../persistence/guided-retrospective-contribution.repository.js"
import type { GuidedRetrospectiveVoteRepository } from "../persistence/guided-retrospective-vote.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../persistence/guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveContributionState } from "../domain/guided-retrospective-contribution.js"
import type { GuidedRetrospectiveTopicState } from "../domain/guided-retrospective-topic.js"
import type {
  GuidedRetrospectiveActionItemHistoryEntry,
  GuidedRetrospectiveActionItemState,
} from "../domain/guided-retrospective-action-item.js"
import {
  assertCanAccessGuidedRetrospectiveRead,
  assertCanCloseGuidedRetrospectiveSession,
  assertCanFacilitateGuidedRetrospective,
  assertCanParticipateGuidedRetrospective,
  resolveRetroActionItemPatchMode,
} from "../policies/guided-retrospective-authorization.policy.js"
import {
  GRETRO_MAX_AGREEMENTS,
  GRETRO_MAX_AGREEMENT_STRING,
} from "../domain/guided-retrospective-limits.js"
import type { z } from "zod"
import type { WorkActivityNotificationsPort } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import type {
  guidedRetroSessionHeaderBodySchema,
  guidedRetroContributionBodySchema,
  guidedRetroTopicBodySchema,
  guidedRetroCloseBodySchema,
  guidedRetroContributionPatchBodySchema,
  guidedRetroMergeTopicsBodySchema,
  guidedRetroVoteBodySchema,
} from "../validation/guided-retrospective-http.schemas.js"
import { guidedRetroProjectActionItemPatchBodySchema } from "../validation/guided-retrospective-http.schemas.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

const OPEN: GuidedRetrospectiveSessionState["status"][] = [
  "planned",
  "open",
  "collecting",
  "voting",
  "closing",
]

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 6; i++) {
    out += chars[randomInt(chars.length)]!
  }
  return out
}

export type GuidedRetroSessionHeaderInput = z.infer<typeof guidedRetroSessionHeaderBodySchema>
export type GuidedRetroContributionInput = z.infer<typeof guidedRetroContributionBodySchema>
export type GuidedRetroTopicInput = z.infer<typeof guidedRetroTopicBodySchema>
export type GuidedRetroCloseInput = z.infer<typeof guidedRetroCloseBodySchema>
export type GuidedRetroContributionPatchInput = z.infer<typeof guidedRetroContributionPatchBodySchema>
export type GuidedRetroMergeTopicsInput = z.infer<typeof guidedRetroMergeTopicsBodySchema>
export type GuidedRetroVoteInput = z.infer<typeof guidedRetroVoteBodySchema>
export type GuidedRetroProjectActionItemPatchInput = z.infer<typeof guidedRetroProjectActionItemPatchBodySchema>

export class GuidedRetrospectiveService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly sessionRepository: GuidedRetrospectiveSessionRepository,
    private readonly topicRepository: GuidedRetrospectiveTopicRepository,
    private readonly contributionRepository: GuidedRetrospectiveContributionRepository,
    private readonly voteRepository: GuidedRetrospectiveVoteRepository,
    private readonly actionItemRepository: GuidedRetrospectiveActionItemRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository,
    private readonly workActivityNotifications: WorkActivityNotificationsPort | null = null,
  ) {}

  async getTodayBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedRetrospective>
    guidedRetrospectiveOperable: boolean
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    sessionDate: string
    sessionSlot: string
    session: GuidedRetrospectiveSessionState | null
    effectiveTemplate: ReturnType<typeof getRetroTemplateOrThrow> | null
  }> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRetrospective(project.operationalApproach)
    const guidedRetrospectiveOperable = supportLevel !== "unsupported"
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_RETROSPECTIVE_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = guidedRetrospectiveOperable
      ? await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
      : null

    let effectiveTemplate: ReturnType<typeof getRetroTemplateOrThrow> | null = null
    if (session) {
      effectiveTemplate = getRetroTemplateOrThrow(session.templateKey)
    }

    return {
      supportLevel,
      guidedRetrospectiveOperable,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      sessionDate,
      sessionSlot,
      session,
      effectiveTemplate,
    }
  }

  async upsertSessionHeader(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroSessionHeaderInput,
  ): Promise<GuidedRetrospectiveSessionState> {
    assertCanFacilitateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_RETROSPECTIVE_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.ensureSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
    })

    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Cannot edit session after it is closed.")
    }

    const now = new Date()
    const templateKey = body.templateKey ?? session.templateKey
    getRetroTemplateOrThrow(templateKey)
    const template = getRetroTemplateOrThrow(templateKey)

    const contributions = await this.contributionRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    if (body.templateKey !== undefined && body.templateKey !== session.templateKey && contributions.length > 0) {
      throw new GuidedRetrospectiveValidationError("Cannot change template after contributions exist in v1.")
    }

    const retrospectiveMode = body.retrospectiveMode ?? session.retrospectiveMode
    let sessionCode = session.sessionCode
    if (retrospectiveMode === "interactive_code" && !sessionCode) {
      sessionCode = generateSessionCode()
    }
    if (retrospectiveMode !== "interactive_code") {
      sessionCode = null
    }

    const votesPerParticipant = body.votesPerParticipant ?? session.votesPerParticipant ?? template.votesPerParticipant
    const allowMultipleVotesPerTopic =
      body.allowMultipleVotesPerTopic ??
      session.allowMultipleVotesPerTopic ??
      template.allowMultipleVotesPerTopic

    const sprintPublicId =
      body.sprintPublicId !== undefined
        ? body.sprintPublicId
        : project.operationalApproach === "scrum"
          ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId)
          : session.sprintPublicId

    let retrospectivePeriod = session.retrospectivePeriod
    if (body.retrospectivePeriod) {
      retrospectivePeriod = body.retrospectivePeriod
    } else if (project.operationalApproach === "kanban" && !retrospectivePeriod) {
      retrospectivePeriod = { periodStartYmd: sessionDate, periodEndYmd: sessionDate }
    }

    const goalSummary =
      body.goalSummary === undefined ? session.goalSummary : this.nullIfEmpty(body.goalSummary)

    const newStatus = body.status === undefined ? session.status : body.status
    let startedAt = session.startedAt
    if (!startedAt && newStatus !== "planned") {
      startedAt = now
    }

    const patch = {
      templateKey,
      retrospectiveMode,
      facilitatorUserPublicId:
        body.facilitatorUserPublicId === undefined ? session.facilitatorUserPublicId : body.facilitatorUserPublicId,
      goalSummary,
      sprintPublicId: sprintPublicId ?? null,
      retrospectivePeriod: retrospectivePeriod ?? null,
      status: newStatus,
      defaultContributionVisibility:
        body.defaultContributionVisibility ?? session.defaultContributionVisibility,
      votesPerParticipant,
      allowMultipleVotesPerTopic,
      sessionCode,
      startedAt,
      updatedAt: now,
    }

    const updated = await this.sessionRepository.updateHeaderWhenWritable(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      patch,
    )
    if (!updated) {
      throw new GuidedRetrospectiveConflictError("Session is no longer editable or was removed.")
    }

    const sprintHint =
      updated.sprintPublicId ??
      (project.operationalApproach === "scrum"
        ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId)
        : null)
    const hints = await this.buildContextHints(
      workspacePublicId,
      projectPublicId,
      project.operationalApproach,
      sprintHint,
    )
    const withHints =
      hints && Object.keys(hints).length > 0
        ? await this.sessionRepository.updateHeaderWhenWritable(workspacePublicId, projectPublicId, session.sessionPublicId, {
            contextHints: hints,
            updatedAt: new Date(),
          })
        : updated

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_session_header_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: updated.sessionPublicId, sessionDate, sessionSlot },
    })

    return withHints ?? updated
  }

  async joinBySessionCode(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    sessionCode: string,
  ): Promise<{
    session: GuidedRetrospectiveSessionState
    projectPublicId: string
  }> {
    assertCanParticipateGuidedRetrospective(actor)
    const code = sessionCode.trim().toUpperCase()
    const session = await this.sessionRepository.findOpenBySessionCodeInWorkspace(workspacePublicId, code)
    if (!session) {
      throw new GuidedRetrospectiveNotFoundError("No open guided retrospective session matches this code.")
    }

    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, session.projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      throw new GuidedRetrospectiveUnsupportedError(
        "This project is not configured for guided retrospectives.",
      )
    }

    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Session is not open for joining.")
    }

    const now = new Date()
    const participants = new Set(session.participantUserPublicIds)
    participants.add(actor.userPublicId)
    const updated = await this.sessionRepository.updateHeaderWhenWritable(
      workspacePublicId,
      session.projectPublicId,
      session.sessionPublicId,
      {
        participantUserPublicIds: [...participants],
        participantCount: participants.size,
        updatedAt: now,
      },
    )
    if (!updated) {
      throw new GuidedRetrospectiveConflictError("Could not record join (session changed).")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_joined_by_code",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId: session.projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId },
    })

    return { session: updated, projectPublicId: session.projectPublicId }
  }

  /**
   * Resolución pública (sin actor): valida código y proyecto operativo. No añade participantes.
   */
  async resolveJoinTargetBySessionCode(sessionCode: string): Promise<{
    session: GuidedRetrospectiveSessionState
    projectPublicId: string
    workspacePublicId: string
  }> {
    const code = sessionCode.trim().toUpperCase()
    const session = await this.sessionRepository.findOpenBySessionCodeGlobally(code)
    if (!session) {
      throw new GuidedRetrospectiveNotFoundError("No open guided retrospective session matches this code.")
    }

    const project = await this.requireWorkspaceRuntimeProject(session.workspacePublicId, session.projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      throw new GuidedRetrospectiveUnsupportedError(
        "This project is not configured for guided retrospectives.",
      )
    }

    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Session is not open for joining.")
    }

    return {
      session,
      projectPublicId: session.projectPublicId,
      workspacePublicId: session.workspacePublicId,
    }
  }

  /**
   * Vista pública (sin actor): mismo alcance que `resolveJoinTargetBySessionCode` y aporta
   * aportaciones y temas con autores ocultos redactados como en vista «no facilitador».
   */
  async getPublicRoomStateBySessionCode(sessionCode: string): Promise<{
    supportLevel: ReturnType<typeof supportLevelForGuidedRetrospective>
    guidedRetrospectiveOperable: boolean
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
    operationalTimeZone: string
    sessionDate: string
    sessionSlot: string
    session: GuidedRetrospectiveSessionState
    effectiveTemplate: ReturnType<typeof getRetroTemplateOrThrow>
    contributions: GuidedRetrospectiveContributionState[]
    topics: GuidedRetrospectiveTopicState[]
    workspacePublicId: string
    projectPublicId: string
  }> {
    const resolved = await this.resolveJoinTargetBySessionCode(sessionCode)
    const { session, projectPublicId, workspacePublicId } = resolved
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForGuidedRetrospective(project.operationalApproach)
    const guidedRetrospectiveOperable = supportLevel !== "unsupported"
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const effectiveTemplate = getRetroTemplateOrThrow(session.templateKey)

    const contribRows = await this.contributionRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const contributions = contribRows.map((c) => this.redactContribution(c, false))

    const topics = await this.topicRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )

    return {
      supportLevel,
      guidedRetrospectiveOperable,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      sessionDate: session.sessionDate,
      sessionSlot: session.sessionSlot,
      session,
      effectiveTemplate,
      contributions,
      topics,
      workspacePublicId,
      projectPublicId,
    }
  }

  async listContributionsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ session: GuidedRetrospectiveSessionState | null; contributions: GuidedRetrospectiveContributionState[] }> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      return { session: null, contributions: [] }
    }

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, contributions: [] }

    const rows = await this.contributionRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const canSeeAuthors = this.actorCanSeeHiddenContributionAuthors(actor)
    const contributions = rows.map((c) => this.redactContribution(c, canSeeAuthors))
    return { session, contributions }
  }

  async appendContributionForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroContributionInput,
  ): Promise<GuidedRetrospectiveContributionState> {
    assertCanParticipateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)

    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_RETROSPECTIVE_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.ensureSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
    })

    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Cannot add contributions after the session is closed.")
    }
    if (session.status === "voting" || session.status === "closing") {
      throw new GuidedRetrospectiveConflictError("Contributions are not accepted during voting or closing.")
    }

    if (!isValidTemplateColumn(session.templateKey, body.templateColumnKey)) {
      throw new GuidedRetrospectiveValidationError("Invalid column for this template.")
    }

    const now = new Date()
    if (session.status === "planned" || session.status === "open") {
      session = (await this.sessionRepository.updateHeaderWhenWritable(
        workspacePublicId,
        projectPublicId,
        session.sessionPublicId,
        {
          status: "collecting",
          startedAt: session.startedAt ?? now,
          updatedAt: now,
        },
      ))!
    }

    const visibilityMode = body.visibilityMode ?? session.defaultContributionVisibility
    const row: GuidedRetrospectiveContributionState = {
      contributionPublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      authorUserPublicId: actor.userPublicId,
      authorGuestLabel: null,
      visibilityMode,
      templateColumnKey: body.templateColumnKey,
      content: body.content.trim(),
      topicPublicId: null,
      topicStatus: "raw",
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    await this.contributionRepository.insert(row)

    const participants = new Set(session.participantUserPublicIds)
    participants.add(actor.userPublicId)
    const withContrib = new Set(session.participantWithContributionUserPublicIds)
    withContrib.add(actor.userPublicId)

    await this.sessionRepository.updateHeaderWhenWritable(workspacePublicId, projectPublicId, session.sessionPublicId, {
      participantUserPublicIds: [...participants],
      participantWithContributionUserPublicIds: [...withContrib],
      participantCount: participants.size,
      participantWithContributionCount: withContrib.size,
      updatedAt: now,
    })

    await this.recomputeSessionDenormalized(workspacePublicId, projectPublicId, session.sessionPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_contribution_created",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, contributionPublicId: row.contributionPublicId },
    })

    return row
  }

  async createTopicForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroTopicInput,
  ): Promise<GuidedRetrospectiveTopicState> {
    assertCanFacilitateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)

    const session = await this.requireOpenSession(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )

    const now = new Date()
    const topics = await this.topicRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const sortOrder = body.sortOrder ?? topics.length

    const topic: GuidedRetrospectiveTopicState = {
      topicPublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      title: body.title.trim(),
      sortOrder,
      voteCount: 0,
      voteStickerTotal: 0,
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
      updatedAt: now,
    }
    await this.topicRepository.insert(topic)
    await this.recomputeSessionDenormalized(workspacePublicId, projectPublicId, session.sessionPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_topic_created",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, topicPublicId: topic.topicPublicId },
    })

    return topic
  }

  async patchContributionForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    contributionPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroContributionPatchInput,
  ): Promise<GuidedRetrospectiveContributionState> {
    assertCanFacilitateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const session = await this.requireOpenSession(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )

    const row = await this.contributionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      contributionPublicId,
    )
    if (!row || row.sessionPublicId !== session.sessionPublicId) {
      throw new GuidedRetrospectiveNotFoundError("Contribution not found.")
    }

    let topicPublicId: string | null = row.topicPublicId
    if (body.topicPublicId !== undefined) {
      topicPublicId = body.topicPublicId
      if (topicPublicId) {
        const topic = await this.topicRepository.findByPublicId(
          workspacePublicId,
          projectPublicId,
          topicPublicId,
        )
        if (!topic || topic.sessionPublicId !== session.sessionPublicId) {
          throw new GuidedRetrospectiveValidationError("Unknown topic for this session.")
        }
      }
    }

    const topicStatus = body.topicStatus ?? row.topicStatus
    const now = new Date()
    const updated = await this.contributionRepository.updateTopicAssignment(
      workspacePublicId,
      projectPublicId,
      contributionPublicId,
      { topicPublicId, topicStatus, updatedAt: now },
    )
    if (!updated) {
      throw new GuidedRetrospectiveConflictError("Could not update contribution.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_contribution_grouped",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: {
        contributionPublicId,
        priorTopicPublicId: row.topicPublicId,
      },
      nextValue: {
        contributionPublicId,
        topicPublicId,
        topicStatus,
      },
    })

    return updated
  }

  async mergeTopicsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroMergeTopicsInput,
  ): Promise<GuidedRetrospectiveTopicState> {
    assertCanFacilitateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const session = await this.requireOpenSession(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )

    const target = await this.topicRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      body.targetTopicPublicId,
    )
    const source = await this.topicRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      body.sourceTopicPublicId,
    )
    if (
      !target ||
      !source ||
      target.sessionPublicId !== session.sessionPublicId ||
      source.sessionPublicId !== session.sessionPublicId
    ) {
      throw new GuidedRetrospectiveNotFoundError("Topics not found on this session.")
    }
    if (target.topicPublicId === source.topicPublicId) {
      throw new GuidedRetrospectiveValidationError("Cannot merge a topic into itself.")
    }

    const now = new Date()
    const contribs = await this.contributionRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    for (const c of contribs) {
      if (c.topicPublicId === source.topicPublicId) {
        await this.contributionRepository.updateTopicAssignment(
          workspacePublicId,
          projectPublicId,
          c.contributionPublicId,
          { topicPublicId: target.topicPublicId, topicStatus: "grouped", updatedAt: now },
        )
      }
    }

    const sourceVotes = await this.voteRepository.listBySessionAndTopic(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      source.topicPublicId,
    )
    for (const v of sourceVotes) {
      await this.voteRepository.deleteVote(
        workspacePublicId,
        projectPublicId,
        session.sessionPublicId,
        v.userPublicId,
        v.topicPublicId,
      )
      await this.applyStickerVote(session, v.userPublicId, target.topicPublicId, v.stickerWeight, now)
    }

    await this.topicRepository.deleteTopic(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      source.topicPublicId,
    )

    await this.syncTopicVoteAggregates(workspacePublicId, projectPublicId, session.sessionPublicId, now)
    await this.recomputeSessionDenormalized(workspacePublicId, projectPublicId, session.sessionPublicId, now)

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_topics_merged",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: { sourceTopicPublicId: source.topicPublicId },
      nextValue: { targetTopicPublicId: target.topicPublicId },
    })

    const finalTarget = await this.topicRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      target.topicPublicId,
    )
    return finalTarget!
  }

  async listTopicsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ session: GuidedRetrospectiveSessionState | null; topics: GuidedRetrospectiveTopicState[] }> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      return { session: null, topics: [] }
    }
    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, topics: [] }
    const topics = await this.topicRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    return { session, topics }
  }

  async voteOnTopicForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroVoteInput,
  ): Promise<void> {
    assertCanParticipateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const session = await this.requireOpenSession(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )

    if (session.status !== "voting" && session.status !== "closing") {
      throw new GuidedRetrospectiveConflictError("Voting is only allowed when the session is in voting or closing phase.")
    }

    const topic = await this.topicRepository.findByPublicId(workspacePublicId, projectPublicId, topicPublicId)
    if (!topic || topic.sessionPublicId !== session.sessionPublicId) {
      throw new GuidedRetrospectiveNotFoundError("Topic not found on this session.")
    }

    const w = body.stickerWeight ?? 1
    const now = new Date()
    await this.applyStickerVote(session, actor.userPublicId, topicPublicId, w, now)
    await this.syncTopicVoteAggregates(workspacePublicId, projectPublicId, session.sessionPublicId, now)
    await this.recomputeSessionDenormalized(workspacePublicId, projectPublicId, session.sessionPublicId, now)
  }

  async deleteVoteOnTopicForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<void> {
    assertCanParticipateGuidedRetrospective(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const session = await this.requireOpenSession(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (session.status !== "voting" && session.status !== "closing") {
      throw new GuidedRetrospectiveConflictError("Votes can only be cleared during voting or closing phase.")
    }
    const now = new Date()
    await this.voteRepository.deleteVote(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      actor.userPublicId,
      topicPublicId,
    )
    await this.syncTopicVoteAggregates(workspacePublicId, projectPublicId, session.sessionPublicId, now)
    await this.recomputeSessionDenormalized(workspacePublicId, projectPublicId, session.sessionPublicId, now)
  }

  async closeToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: GuidedRetroCloseInput,
  ): Promise<GuidedRetrospectiveSessionState> {
    assertCanCloseGuidedRetrospectiveSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_RETROSPECTIVE_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      session = await this.ensureSessionLazy(actor, workspacePublicId, projectPublicId, sessionDate, sessionSlot, {
        operationalApproach: project.operationalApproach,
        operationalTimeZone,
      })
    }

    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Session is already closed.")
    }

    if (body.agreements.length > GRETRO_MAX_AGREEMENTS) {
      throw new GuidedRetrospectiveValidationError("Too many agreements.")
    }
    for (const a of body.agreements) {
      if (a.length > GRETRO_MAX_AGREEMENT_STRING) {
        throw new GuidedRetrospectiveValidationError("Agreement entry too long.")
      }
    }

    const now = new Date()
    const status: GuidedRetrospectiveSessionState["status"] =
      body.actionItems.length === 0 ? "closed_without_actions" : "closed"

    const actionRows: GuidedRetrospectiveActionItemState[] = body.actionItems.map((a) => ({
      actionItemPublicId: randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      title: a.title.trim(),
      description: a.description === undefined ? null : this.nullIfEmpty(a.description),
      ownerUserPublicId: a.ownerUserPublicId ?? null,
      dueDate: a.dueDate ?? null,
      priority: a.priority ?? "medium",
      sourceContributionIds: [...(a.sourceContributionIds ?? [])],
      sourceTopicPublicIds: [...(a.sourceTopicPublicIds ?? [])],
      status: a.status ?? "pending",
      history: [],
      createdAt: now,
      updatedAt: now,
    }))

    await this.actionItemRepository.replaceAllForSession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      actionRows,
    )

    const closed = await this.sessionRepository.closeSession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        status,
        closedAt: now,
        summary: body.summary === undefined ? null : this.nullIfEmpty(body.summary),
        agreements: [...body.agreements],
        facilitatorUserPublicId: actor.userPublicId,
        sessionCode: null,
        updatedAt: now,
      },
    )

    if (!closed) {
      throw new GuidedRetrospectiveConflictError("Session could not be closed (race or state).")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_session_closed",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, status },
    })

    for (const ai of actionRows) {
      if (ai.ownerUserPublicId && ai.ownerUserPublicId !== actor.userPublicId) {
        await this.workActivityNotifications?.onGuidedRetroActionAssigned({
          workspacePublicId,
          projectPublicId,
          actionItemPublicId: ai.actionItemPublicId,
          actorUserPublicId: actor.userPublicId,
          assigneeUserPublicId: ai.ownerUserPublicId,
          actionTitle: ai.title,
          assignmentEventId: randomUUID(),
          at: now,
        })
      }
    }

    return closed
  }

  async appendAdditiveNoteAfterClose(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    noteText: string,
  ): Promise<GuidedRetrospectiveSessionState> {
    assertCanCloseGuidedRetrospectiveSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedRetrospectiveNotFoundError("Session not found.")
    }
    if (OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Additive notes are only allowed after close.")
    }

    const now = new Date()
    const note: GuidedRetrospectiveAdditiveNote = {
      noteText: noteText.trim(),
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
    }

    const updated = await this.sessionRepository.appendAdditiveNoteAfterClose(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      note,
      now,
    )
    if (!updated) {
      throw new GuidedRetrospectiveConflictError("Could not append additive note.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_additive_note_appended",
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
  ): Promise<GuidedRetrospectiveSessionState> {
    assertCanCloseGuidedRetrospectiveSession(actor)
    const project = await this.requireScrumOrKanbanProject(workspacePublicId, projectPublicId)
    this.assertWritableApproach(project.operationalApproach)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)

    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedRetrospectiveNotFoundError("Session not found.")
    }
    if (OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Transcript after close applies only after the session is closed.")
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
      throw new GuidedRetrospectiveConflictError("Could not update transcript after close.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_transcript_after_close_upserted",
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
  ): Promise<GuidedRetrospectiveSessionState[]> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      return []
    }
    return this.sessionRepository.listRecentForProject(workspacePublicId, projectPublicId, limit)
  }

  async listActionItemsForToday(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    session: GuidedRetrospectiveSessionState | null
    actionItems: GuidedRetrospectiveActionItemState[]
  }> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const { sessionDate, sessionSlot } = await this.resolveSessionKey(workspacePublicId, projectPublicId, opts)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      return { session: null, actionItems: [] }
    }
    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) return { session: null, actionItems: [] }
    const actionItems = await this.actionItemRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    return { session, actionItems }
  }

  async listProjectActionItems(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    query: {
      status?: GuidedRetrospectiveActionItemState["status"]
      assignee?: "me"
      ownerUserPublicId?: string
      unassigned?: "1" | "true"
      priority?: GuidedRetrospectiveActionItemState["priority"]
    },
  ): Promise<
    Array<{
      actionItem: GuidedRetrospectiveActionItemState
      retroSessionDate: string | null
      retroSessionSlot: string | null
    }>
  > {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      return []
    }
    let rows = await this.actionItemRepository.listByProject(workspacePublicId, projectPublicId)
    if (query.status) {
      rows = rows.filter((r) => r.status === query.status)
    }
    if (query.priority) {
      rows = rows.filter((r) => r.priority === query.priority)
    }
    if (query.unassigned != null) {
      rows = rows.filter((r) => r.ownerUserPublicId == null)
    } else if (query.ownerUserPublicId != null) {
      rows = rows.filter((r) => r.ownerUserPublicId === query.ownerUserPublicId)
    } else if (query.assignee === "me") {
      rows = rows.filter((r) => r.ownerUserPublicId === actor.userPublicId)
    }
    const sessionIds = [...new Set(rows.map((r) => r.sessionPublicId))]
    const sessions = await Promise.all(
      sessionIds.map((id) => this.sessionRepository.findByPublicId(workspacePublicId, projectPublicId, id)),
    )
    const sessionById = new Map(
      sessions.filter((s): s is NonNullable<typeof s> => s != null).map((s) => [s.sessionPublicId, s]),
    )
    return rows.map((row) => {
      const s = sessionById.get(row.sessionPublicId)
      return {
        actionItem: row,
        retroSessionDate: s?.sessionDate ?? null,
        retroSessionSlot: s?.sessionSlot ?? null,
      }
    })
  }

  async patchProjectActionItem(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    actionItemPublicId: string,
    body: GuidedRetroProjectActionItemPatchInput,
  ): Promise<GuidedRetrospectiveActionItemState> {
    assertCanAccessGuidedRetrospectiveRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    if (supportLevelForGuidedRetrospective(project.operationalApproach) === "unsupported") {
      throw new GuidedRetrospectiveUnsupportedError("Guided retrospective is not supported for this project.")
    }
    const prev = await this.actionItemRepository.findByPublicId(workspacePublicId, projectPublicId, actionItemPublicId)
    if (!prev) {
      throw new GuidedRetrospectiveNotFoundError("Action item not found.")
    }
    const mode = resolveRetroActionItemPatchMode(actor, prev.ownerUserPublicId)
    if (mode === null) {
      throw new GuidedRetrospectiveForbiddenError("You cannot update this action item.")
    }
    const has = (key: keyof GuidedRetroProjectActionItemPatchInput) => body[key] !== undefined
    if (mode === "assignee") {
      if (has("title") || has("ownerUserPublicId")) {
        throw new GuidedRetrospectiveValidationError("Assignees cannot change title or owner.")
      }
    }

    const now = new Date()
    const history: GuidedRetrospectiveActionItemHistoryEntry[] = []
    const fields: Partial<
      Pick<
        GuidedRetrospectiveActionItemState,
        "title" | "description" | "ownerUserPublicId" | "dueDate" | "priority" | "status"
      >
    > = {}

    if (has("title") && body.title !== undefined) {
      const nextTitle = body.title.trim()
      if (nextTitle !== prev.title) {
        fields.title = nextTitle
        history.push(
          this.makeActionHistoryEntry("title_changed", "Título actualizado.", actor.userPublicId, now),
        )
      }
    }
    if (has("description")) {
      const nextDescription = this.nullIfEmpty(body.description)
      if (nextDescription !== prev.description) {
        fields.description = nextDescription
        history.push(
          this.makeActionHistoryEntry("description_changed", "Descripción actualizada.", actor.userPublicId, now),
        )
      }
    }
    if (has("ownerUserPublicId")) {
      const nextOwner = body.ownerUserPublicId ?? null
      if (nextOwner !== prev.ownerUserPublicId) {
        fields.ownerUserPublicId = nextOwner
        const msg =
          nextOwner == null
            ? "Responsable sin asignar."
            : prev.ownerUserPublicId == null
              ? "Responsable asignado."
              : "Responsable actualizado."
        history.push(this.makeActionHistoryEntry("owner_changed", msg, actor.userPublicId, now))
      }
    }
    if (has("dueDate")) {
      const nextDue = body.dueDate ?? null
      if (nextDue !== prev.dueDate) {
        fields.dueDate = nextDue
        const msg = nextDue == null ? "Vencimiento eliminado." : `Vencimiento: ${nextDue}.`
        history.push(this.makeActionHistoryEntry("due_changed", msg, actor.userPublicId, now))
      }
    }
    if (has("priority") && body.priority !== undefined && body.priority !== prev.priority) {
      fields.priority = body.priority
      history.push(
        this.makeActionHistoryEntry(
          "priority_changed",
          `Prioridad: ${this.retroActionPriorityLabel(body.priority)}.`,
          actor.userPublicId,
          now,
        ),
      )
    }
    if (has("status") && body.status !== undefined && body.status !== prev.status) {
      fields.status = body.status
      history.push(
        this.makeActionHistoryEntry(
          "status_changed",
          `Estado: ${this.retroActionStatusLabel(body.status)}.`,
          actor.userPublicId,
          now,
        ),
      )
    }
    if (has("historyNote") && body.historyNote !== undefined) {
      const note = body.historyNote.trim()
      history.push(this.makeActionHistoryEntry("note", note, actor.userPublicId, now))
    }

    if (Object.keys(fields).length === 0 && history.length === 0) {
      throw new GuidedRetrospectiveValidationError("No changes provided.")
    }

    const updated = await this.actionItemRepository.applyPatchWithHistory(
      workspacePublicId,
      projectPublicId,
      actionItemPublicId,
      fields,
      history,
      now,
    )
    if (!updated) {
      throw new GuidedRetrospectiveNotFoundError("Action item not found.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "guided_retrospective_session",
      action: "guided_retrospective_action_item_patched",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: {
        actionItemPublicId,
        fieldKeys: Object.keys(fields),
        historyKinds: history.map((h) => h.kind),
      },
      nextValue: { actionItemPublicId },
    })

    if (
      updated.ownerUserPublicId &&
      updated.ownerUserPublicId !== prev.ownerUserPublicId &&
      updated.ownerUserPublicId !== actor.userPublicId
    ) {
      await this.workActivityNotifications?.onGuidedRetroActionAssigned({
        workspacePublicId,
        projectPublicId,
        actionItemPublicId: updated.actionItemPublicId,
        actorUserPublicId: actor.userPublicId,
        assigneeUserPublicId: updated.ownerUserPublicId,
        actionTitle: updated.title,
        assignmentEventId: randomUUID(),
        at: now,
      })
    }

    return updated
  }

  private async applyStickerVote(
    session: GuidedRetrospectiveSessionState,
    userPublicId: string,
    topicPublicId: string,
    requestedWeight: number,
    now: Date,
  ): Promise<void> {
    let w = Math.max(1, Math.floor(requestedWeight))
    if (!session.allowMultipleVotesPerTopic) {
      w = 1
    }

    let userVotes = await this.voteRepository.listBySessionAndUser(
      session.workspacePublicId,
      session.projectPublicId,
      session.sessionPublicId,
      userPublicId,
    )

    const others = userVotes.filter((v) => v.topicPublicId !== topicPublicId)

    let usedOther = others.reduce((a, v) => a + v.stickerWeight, 0)
    let newOnTopic = w

    let total = usedOther + newOnTopic
    if (total > session.votesPerParticipant) {
      const over = total - session.votesPerParticipant
      await this.trimVotesFromOtherTopics(
        session,
        userPublicId,
        topicPublicId,
        over,
        now,
      )
      userVotes = await this.voteRepository.listBySessionAndUser(
        session.workspacePublicId,
        session.projectPublicId,
        session.sessionPublicId,
        userPublicId,
      )
      const others2 = userVotes.filter((v) => v.topicPublicId !== topicPublicId)
      usedOther = others2.reduce((a, v) => a + v.stickerWeight, 0)
      newOnTopic = w
      total = usedOther + newOnTopic
      if (total > session.votesPerParticipant) {
        newOnTopic = Math.max(0, session.votesPerParticipant - usedOther)
      }
    }

    if (newOnTopic <= 0) {
      const hadVote = await this.voteRepository.findUserVoteOnTopic(
        session.workspacePublicId,
        session.projectPublicId,
        session.sessionPublicId,
        userPublicId,
        topicPublicId,
      )
      if (hadVote) {
        await this.voteRepository.deleteVote(
          session.workspacePublicId,
          session.projectPublicId,
          session.sessionPublicId,
          userPublicId,
          topicPublicId,
        )
      }
      return
    }

    const onTopicAfter = await this.voteRepository.findUserVoteOnTopic(
      session.workspacePublicId,
      session.projectPublicId,
      session.sessionPublicId,
      userPublicId,
      topicPublicId,
    )

    const row = {
      votePublicId: onTopicAfter?.votePublicId ?? randomUUID(),
      sessionPublicId: session.sessionPublicId,
      workspacePublicId: session.workspacePublicId,
      projectPublicId: session.projectPublicId,
      topicPublicId,
      userPublicId,
      stickerWeight: newOnTopic,
      createdAt: onTopicAfter?.createdAt ?? now,
      updatedAt: now,
    }
    await this.voteRepository.upsertVote(row)
  }

  private async trimVotesFromOtherTopics(
    session: GuidedRetrospectiveSessionState,
    userPublicId: string,
    excludeTopicId: string,
    over: number,
    now: Date,
  ): Promise<void> {
    let remaining = over
    const others = (
      await this.voteRepository.listBySessionAndUser(
        session.workspacePublicId,
        session.projectPublicId,
        session.sessionPublicId,
        userPublicId,
      )
    )
      .filter((v) => v.topicPublicId !== excludeTopicId)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())

    for (const v of others) {
      if (remaining <= 0) break
      const cut = Math.min(v.stickerWeight, remaining)
      const newW = v.stickerWeight - cut
      remaining -= cut
      if (newW <= 0) {
        await this.voteRepository.deleteVote(
          session.workspacePublicId,
          session.projectPublicId,
          session.sessionPublicId,
          userPublicId,
          v.topicPublicId,
        )
      } else {
        await this.voteRepository.upsertVote({
          ...v,
          stickerWeight: newW,
          updatedAt: now,
        })
      }
    }
  }

  private async syncTopicVoteAggregates(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    now: Date,
  ): Promise<void> {
    const votes = await this.voteRepository.listBySession(workspacePublicId, projectPublicId, sessionPublicId)
    const byTopic = new Map<string, { c: number; s: number }>()
    for (const v of votes) {
      const cur = byTopic.get(v.topicPublicId) ?? { c: 0, s: 0 }
      cur.c++
      cur.s += v.stickerWeight
      byTopic.set(v.topicPublicId, cur)
    }
    const topics = await this.topicRepository.listBySession(workspacePublicId, projectPublicId, sessionPublicId)
    for (const t of topics) {
      const agg = byTopic.get(t.topicPublicId) ?? { c: 0, s: 0 }
      await this.topicRepository.updateVoteAggregates(
        workspacePublicId,
        projectPublicId,
        t.topicPublicId,
        { voteCount: agg.c, voteStickerTotal: agg.s, updatedAt: now },
      )
    }
  }

  private async recomputeSessionDenormalized(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    updatedAt: Date,
  ): Promise<void> {
    const session = await this.sessionRepository.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!session) return
    const contributionCount = await this.contributionRepository.countBySession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const topics = await this.topicRepository.listBySession(workspacePublicId, projectPublicId, sessionPublicId)
    const voteAgg = await this.voteRepository.aggregateForSession(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    await this.sessionRepository.updateDenormalizedCounts(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
      {
        contributionCount,
        topicCount: topics.length,
        voteRecordCount: voteAgg.voteRecordCount,
        sessionVoteStickerTotal: voteAgg.sessionVoteStickerTotal,
        participantCount: session.participantUserPublicIds.length,
        participantWithContributionCount: session.participantWithContributionUserPublicIds.length,
        updatedAt,
      },
    )
  }

  private redactContribution(
    row: GuidedRetrospectiveContributionState,
    canSeeHiddenAuthors: boolean,
  ): GuidedRetrospectiveContributionState {
    if (row.visibilityMode === "hidden_from_peers" && !canSeeHiddenAuthors) {
      return {
        ...row,
        authorUserPublicId: "",
        authorGuestLabel: null,
      }
    }
    return row
  }

  private retroActionStatusLabel(s: GuidedRetrospectiveActionItemState["status"]): string {
    switch (s) {
      case "pending":
        return "Pendiente"
      case "analyzing":
        return "Analizando"
      case "executing":
        return "Ejecutando"
      case "reviewing":
        return "Revisando"
      case "finished":
        return "Finalizado"
      case "dropped":
        return "Descartada"
      default:
        return String(s)
    }
  }

  private retroActionPriorityLabel(p: GuidedRetrospectiveActionItemState["priority"]): string {
    return p === "high" ? "Alta" : p === "medium" ? "Media" : "Baja"
  }

  private makeActionHistoryEntry(
    kind: GuidedRetrospectiveActionItemHistoryEntry["kind"],
    message: string,
    actorUserPublicId: string,
    occurredAt: Date,
  ): GuidedRetrospectiveActionItemHistoryEntry {
    return {
      historyEntryPublicId: randomUUID(),
      actorUserPublicId,
      occurredAt,
      kind,
      message,
    }
  }

  private actorCanSeeHiddenContributionAuthors(actor: WorkspaceMemberState): boolean {
    if (this.isFacilitatorClass(actor)) {
      return true
    }
    return false
  }

  private isFacilitatorClass(actor: WorkspaceMemberState): boolean {
    const ar = actor.workspaceRoleAdministrative
    const mr = actor.workspaceRoleMethodological
    if (ar === "admin" || ar === "operator") return true
    if (mr === "agility_lead" || mr === "scrum_master" || mr === "product_owner") return true
    return false
  }

  private async resolveSessionKey(
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{ sessionDate: string; sessionSlot: string }> {
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate = opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || GUIDED_RETROSPECTIVE_DEFAULT_SLOT
    this.assertSlot(sessionSlot)
    return { sessionDate, sessionSlot }
  }

  private async requireOpenSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedRetrospectiveSessionState> {
    const session = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (!session) {
      throw new GuidedRetrospectiveNotFoundError("Session not found for this day and slot.")
    }
    if (!OPEN.includes(session.status)) {
      throw new GuidedRetrospectiveConflictError("Session is closed.")
    }
    return session
  }

  private async ensureSessionLazy(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
    ctx: {
      operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"]
      operationalTimeZone: string
    },
  ): Promise<GuidedRetrospectiveSessionState> {
    const found = await this.sessionRepository.findByKey(workspacePublicId, projectPublicId, sessionDate, sessionSlot)
    if (found) return found

    const session = await this.createSessionDocument(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      ctx.operationalApproach,
      ctx.operationalTimeZone,
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
      category: "guided_retrospective_session",
      action: "guided_retrospective_session_created_lazy",
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
  ): Promise<GuidedRetrospectiveSessionState> {
    const now = new Date()
    const templateKey = "start_stop_continue"
    const template = getRetroTemplateOrThrow(templateKey)
    const sprintPublicId =
      operationalApproach === "scrum"
        ? await this.resolveActiveSprintPublicId(workspacePublicId, projectPublicId)
        : null
    const retrospectivePeriod =
      operationalApproach === "kanban"
        ? { periodStartYmd: sessionDate, periodEndYmd: sessionDate }
        : null

    const hints = await this.buildContextHints(workspacePublicId, projectPublicId, operationalApproach, sprintPublicId)

    return {
      sessionPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      sprintPublicId,
      retrospectivePeriod,
      operationalApproach,
      operationalTimeZone,
      retrospectiveMode: "classic",
      facilitatorUserPublicId: null,
      status: "planned",
      templateKey,
      sessionCode: null,
      votesPerParticipant: template.votesPerParticipant,
      allowMultipleVotesPerTopic: template.allowMultipleVotesPerTopic,
      defaultContributionVisibility: "visible_to_all",
      goalSummary: null,
      summary: null,
      agreements: [],
      participantUserPublicIds: [],
      participantWithContributionUserPublicIds: [],
      participantCount: 0,
      participantWithContributionCount: 0,
      contributionCount: 0,
      topicCount: 0,
      voteRecordCount: 0,
      sessionVoteStickerTotal: 0,
      startedAt: null,
      closedAt: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      contextHints: hints,
      createdAt: now,
      updatedAt: now,
    }
  }

  private async buildContextHints(
    workspacePublicId: string,
    projectPublicId: string,
    operationalApproach: WorkspaceRuntimeProjectState["operationalApproach"],
    sprintPublicId: string | null,
  ): Promise<Record<string, string> | null> {
    const out: Record<string, string> = {}
    if (operationalApproach === "scrum" && sprintPublicId) {
      const sprints = await this.sprintPlanningRepository.listSprintsByProject(workspacePublicId, projectPublicId)
      const sp = sprints.find((s) => s.sprintPublicId === sprintPublicId)
      if (sp?.goal?.trim()) {
        out.activeSprintGoal = sp.goal.trim()
      }
    }
    if (operationalApproach === "kanban") {
      out.retrospectiveLens = "flow_period"
    }
    if (operationalApproach === "predictive_phases") {
      out.guidedRetrospectiveSupport = "unsupported"
    }
    return Object.keys(out).length > 0 ? out : null
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
      throw new GuidedRetrospectiveValidationError("Invalid session slot.")
    }
  }

  private assertWritableApproach(approach: WorkspaceRuntimeProjectState["operationalApproach"]): void {
    if (supportLevelForGuidedRetrospective(approach) === "unsupported") {
      throw new GuidedRetrospectiveUnsupportedError(
        "Guided retrospective is not operable for predictive_phases projects in v1.",
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
      throw new GuidedRetrospectiveNotFoundError("Operational project not found.")
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
        throw new GuidedRetrospectiveNotFoundError("Operational project not found.")
      }
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new GuidedRetrospectiveUnsupportedError(
          "Guided retrospective requires scrum or kanban operational projects for writes.",
        )
      }
      throw e
    }
  }
}
