import { randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkItemTimeEntriesRepository } from "../../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import {
  DAILY_ALIGNMENT_DEFAULT_SLOT,
  type DailyAlignmentMode,
  type DailyAlignmentSessionState,
} from "../domain/daily-alignment-session.js"
import {
  DailyAlignmentConflictError,
  DailyAlignmentNotFoundError,
  DailyAlignmentUnsupportedError,
  DailyAlignmentValidationError,
} from "../domain/daily-alignment.errors.js"
import { supportLevelForOperationalApproach } from "../domain/daily-alignment-support-level.js"
import {
  previousBusinessDayYmdFromSessionYmd,
  resolveOperationalTimeZoneIana,
  todayYmdOperational,
} from "../domain/operational-calendar.js"
import type { DailyAlignmentParticipantUpdateRepository } from "../persistence/daily-alignment-participant-update.repository.js"
import type { DailyAlignmentSessionRepository } from "../persistence/daily-alignment-session.repository.js"
import {
  assertCanAccessDailyAlignmentRead,
  assertCanCloseDailyAlignmentSession,
  assertCanUpsertOwnDailyParticipant,
} from "../policies/daily-alignment-authorization.policy.js"
import { buildSuggestionBasisAndHints } from "./daily-alignment-suggestion-context.js"

function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 11000
}

const EXPECTED_METHODOLOGY: Array<NonNullable<WorkspaceMemberState["workspaceRoleMethodological"]>> = [
  "scrum_developer",
  "scrum_master",
  "product_owner",
]

export type DailyAlignmentCloseInput = {
  generalSummary: string
  agreements: string[]
  escalatedImpediments: string[]
  followUps: string[]
}

export type DailyAlignmentMyUpdateInput = {
  yesterdaySummary: string
  todayPlan: string
  impediments: string
  confirmedFromSuggestion: boolean
  alignmentMode?: DailyAlignmentMode
}

export class DailyAlignmentService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintPlanningRepository: ScrumSprintPlanningRepository,
    private readonly sessionRepository: DailyAlignmentSessionRepository,
    private readonly participantRepository: DailyAlignmentParticipantUpdateRepository,
    private readonly timeEntriesRepository: WorkItemTimeEntriesRepository,
    private readonly auditLogRepository: WorkspaceAuditLogRepository,
    private readonly workTeamProjectLinkRepository: WorkTeamProjectLinkRepository,
    private readonly workTeamMembershipRepository: WorkTeamMembershipRepository,
    private readonly workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  async getTodayBootstrap(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForOperationalApproach>
    operationalApproach: string
    operationalTimeZone: string
    sessionDate: string
    sessionSlot: string
    session: DailyAlignmentSessionState | null
  }> {
    assertCanAccessDailyAlignmentRead(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const project = (await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId))!
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate =
      opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || DAILY_ALIGNMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    return {
      supportLevel,
      operationalApproach: project.operationalApproach,
      operationalTimeZone,
      sessionDate,
      sessionSlot,
      session,
    }
  }

  async getRecentSessions(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<DailyAlignmentSessionState[]> {
    assertCanAccessDailyAlignmentRead(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const cap = Math.min(Math.max(limit, 1), 500)
    return this.sessionRepository.listRecentForProject(workspacePublicId, projectPublicId, cap)
  }

  async getSessionDetailByPublicId(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForOperationalApproach>
    session: DailyAlignmentSessionState | null
    participants: import("../domain/daily-alignment-session.js").DailyAlignmentParticipantUpdateState[]
    expectedParticipantUserPublicIds: string[]
    missingParticipantUserPublicIds: string[]
  }> {
    assertCanAccessDailyAlignmentRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)

    const session = await this.sessionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    const expectedParticipantUserPublicIds = await this.resolveExpectedParticipantUserPublicIds(
      workspacePublicId,
      projectPublicId,
    )
    if (!session) {
      return {
        supportLevel,
        session: null,
        participants: [],
        expectedParticipantUserPublicIds,
        missingParticipantUserPublicIds: [...expectedParticipantUserPublicIds],
      }
    }
    const participants = await this.participantRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const present = new Set(participants.filter((p) => p.isSubmitted).map((p) => p.userPublicId))
    const missingParticipantUserPublicIds = expectedParticipantUserPublicIds.filter((u) => !present.has(u))
    return {
      supportLevel,
      session,
      participants,
      expectedParticipantUserPublicIds,
      missingParticipantUserPublicIds,
    }
  }

  async patchFacilitatorTranscript(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    facilitatorTranscript: string,
  ): Promise<DailyAlignmentSessionState> {
    assertCanCloseDailyAlignmentSession(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)

    const session = await this.sessionRepository.findByPublicId(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    if (!session) {
      throw new DailyAlignmentNotFoundError("Daily alignment session not found.")
    }
    if (session.status === "open") {
      throw new DailyAlignmentConflictError("Facilitator transcript can only be edited after the session is closed.")
    }

    const trimmed = facilitatorTranscript.trim()
    const value = trimmed.length === 0 ? null : trimmed
    const now = new Date()
    const updated = await this.sessionRepository.updateFacilitatorTranscriptIfClosed(
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
      value,
      now,
    )
    if (!updated) {
      throw new DailyAlignmentNotFoundError("Session not found when updating facilitator transcript.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "daily_alignment_session",
      action: "daily_alignment_facilitator_transcript_updated",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId, hasTranscript: value !== null },
    })

    return updated
  }

  async getMyUpdate(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForOperationalApproach>
    session: DailyAlignmentSessionState | null
    update: import("../domain/daily-alignment-session.js").DailyAlignmentParticipantUpdateState | null
    suggestions: Awaited<ReturnType<typeof buildSuggestionBasisAndHints>> | null
  }> {
    assertCanAccessDailyAlignmentRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate =
      opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || DAILY_ALIGNMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (!session) {
      return { supportLevel, session: null, update: null, suggestions: null }
    }
    const update = await this.participantRepository.findBySessionAndUser(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      actor.userPublicId,
    )
    if (supportLevel === "unsupported") {
      return { supportLevel, session, update, suggestions: null }
    }
    const referenceYmd = previousBusinessDayYmdFromSessionYmd(sessionDate, operationalTimeZone)
    const suggestions = await buildSuggestionBasisAndHints({
      workspacePublicId,
      projectPublicId,
      userPublicId: actor.userPublicId,
      sessionYmd: sessionDate,
      operationalTimeZone,
      timeEntriesRepository: this.timeEntriesRepository,
      auditLogRepository: this.auditLogRepository,
      yesterdaySummary: update?.yesterdaySummary ?? "",
      referenceYmd,
    })
    return { supportLevel, session, update, suggestions }
  }

  async upsertMyUpdate(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: DailyAlignmentMyUpdateInput,
  ): Promise<{
    session: DailyAlignmentSessionState
    update: import("../domain/daily-alignment-session.js").DailyAlignmentParticipantUpdateState
    suggestions: Awaited<ReturnType<typeof buildSuggestionBasisAndHints>>
  }> {
    assertCanUpsertOwnDailyParticipant(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)
    if (supportLevel === "unsupported") {
      throw new DailyAlignmentUnsupportedError(
        "Daily alignment is not available for predictive_phases projects in v1.",
      )
    }
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate =
      opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || DAILY_ALIGNMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.ensureOpenSessionLazy(
      actor,
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
      project.operationalApproach,
      operationalTimeZone,
      body.alignmentMode ?? "live",
    )

    if (session.status !== "open") {
      throw new DailyAlignmentConflictError("Cannot edit participant update after the session is closed.")
    }

    if (body.alignmentMode === "async") {
      const updated = await this.sessionRepository.updateAlignmentModeIfOpen(
        workspacePublicId,
        projectPublicId,
        session.sessionPublicId,
        "async",
        new Date(),
      )
      if (updated) session = updated
    }

    const referenceYmd = previousBusinessDayYmdFromSessionYmd(sessionDate, operationalTimeZone)
    const { basis, hints, draftBulletsYesterday } = await buildSuggestionBasisAndHints({
      workspacePublicId,
      projectPublicId,
      userPublicId: actor.userPublicId,
      sessionYmd: sessionDate,
      operationalTimeZone,
      timeEntriesRepository: this.timeEntriesRepository,
      auditLogRepository: this.auditLogRepository,
      yesterdaySummary: body.yesterdaySummary,
      referenceYmd,
    })

    const trimmedY = body.yesterdaySummary.trim()
    const trimmedT = body.todayPlan.trim()
    const trimmedI = body.impediments.trim()
    const hasContent = trimmedY.length + trimmedT.length + trimmedI.length > 0
    let sourceMode: import("../domain/daily-alignment-session.js").DailyAlignmentParticipantSourceMode = "manual"
    if (body.confirmedFromSuggestion && hasContent) {
      sourceMode = "confirmed_from_suggestion"
    }

    const now = new Date()
    const existing = await this.participantRepository.findBySessionAndUser(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      actor.userPublicId,
    )
    const participantUpdatePublicId = existing?.participantUpdatePublicId ?? randomUUID()

    const update = await this.participantRepository.upsert({
      participantUpdatePublicId,
      sessionPublicId: session.sessionPublicId,
      workspacePublicId,
      projectPublicId,
      userPublicId: actor.userPublicId,
      yesterdaySummary: body.yesterdaySummary,
      todayPlan: body.todayPlan,
      impediments: body.impediments,
      suggestionBasisSnapshot: basis,
      consistencyHintsSnapshot: hints,
      sourceMode,
      isSubmitted: hasContent,
      submittedAt: hasContent ? (existing?.submittedAt ?? now) : (existing?.submittedAt ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "daily_alignment_session",
      action: "daily_alignment_participant_update_upserted",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        userPublicId: actor.userPublicId,
        participantUpdatePublicId: update.participantUpdatePublicId,
      },
    })

    return {
      session,
      update,
      suggestions: { basis, hints, draftBulletsYesterday },
    }
  }

  async getSessionForFacilitator(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
  ): Promise<{
    supportLevel: ReturnType<typeof supportLevelForOperationalApproach>
    session: DailyAlignmentSessionState | null
    participants: import("../domain/daily-alignment-session.js").DailyAlignmentParticipantUpdateState[]
    expectedParticipantUserPublicIds: string[]
    missingParticipantUserPublicIds: string[]
  }> {
    assertCanAccessDailyAlignmentRead(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate =
      opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || DAILY_ALIGNMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    const session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    const expectedParticipantUserPublicIds = await this.resolveExpectedParticipantUserPublicIds(
      workspacePublicId,
      projectPublicId,
    )
    if (!session) {
      return {
        supportLevel,
        session: null,
        participants: [],
        expectedParticipantUserPublicIds,
        missingParticipantUserPublicIds: [...expectedParticipantUserPublicIds],
      }
    }
    const participants = await this.participantRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const present = new Set(
      participants.filter((p) => p.isSubmitted).map((p) => p.userPublicId),
    )
    const missingParticipantUserPublicIds = expectedParticipantUserPublicIds.filter((u) => !present.has(u))
    return {
      supportLevel,
      session,
      participants,
      expectedParticipantUserPublicIds,
      missingParticipantUserPublicIds,
    }
  }

  async closeSession(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    opts: { sessionDate?: string; sessionSlot?: string },
    body: DailyAlignmentCloseInput,
  ): Promise<DailyAlignmentSessionState> {
    assertCanCloseDailyAlignmentSession(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const supportLevel = supportLevelForOperationalApproach(project.operationalApproach)
    if (supportLevel === "unsupported") {
      throw new DailyAlignmentUnsupportedError(
        "Daily alignment close is not supported for predictive_phases projects in v1.",
      )
    }
    const operationalTimeZone = resolveOperationalTimeZoneIana()
    const sessionDate =
      opts.sessionDate?.trim() || todayYmdOperational(operationalTimeZone)
    const sessionSlot = opts.sessionSlot?.trim() || DAILY_ALIGNMENT_DEFAULT_SLOT
    this.assertSlot(sessionSlot)

    let session = await this.sessionRepository.findByKey(
      workspacePublicId,
      projectPublicId,
      sessionDate,
      sessionSlot,
    )
    if (!session) {
      session = await this.createSessionDocument(
        workspacePublicId,
        projectPublicId,
        sessionDate,
        sessionSlot,
        project.operationalApproach,
        operationalTimeZone,
        "live",
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
        session = again
      }
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "daily_alignment_session",
        action: "daily_alignment_session_created_lazy",
        actorUserPublicId: actor.userPublicId,
        occurredAt: new Date(),
        resource: { projectPublicId, backlogItemPublicId: null },
        previousValue: null,
        nextValue: { sessionPublicId: session.sessionPublicId, reason: "close_without_prior_writes" },
      })
    }

    if (session.status !== "open") {
      throw new DailyAlignmentConflictError("Session is already closed.")
    }

    const expectedParticipantUserPublicIds = await this.resolveExpectedParticipantUserPublicIds(
      workspacePublicId,
      projectPublicId,
    )
    const participants = await this.participantRepository.listBySession(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
    )
    const present = new Set(participants.filter((p) => p.isSubmitted).map((p) => p.userPublicId))
    const missingParticipantUserPublicIds = expectedParticipantUserPublicIds.filter((u) => !present.has(u))
    const status = missingParticipantUserPublicIds.length > 0 ? "closed_incomplete" : "closed"
    const now = new Date()

    const closed = await this.sessionRepository.updateCloseoutAndStatus(
      workspacePublicId,
      projectPublicId,
      session.sessionPublicId,
      {
        status,
        closedAt: now,
        closeoutSummary: body.generalSummary,
        agreements: body.agreements,
        escalatedImpediments: body.escalatedImpediments,
        followUps: body.followUps,
        facilitatorUserPublicId: actor.userPublicId,
        updatedAt: now,
      },
    )
    if (!closed) {
      throw new DailyAlignmentNotFoundError("Session not found when applying closeout.")
    }

    await this.auditLogRepository.append({
      workspacePublicId,
      category: "daily_alignment_session",
      action: "daily_alignment_session_closed",
      actorUserPublicId: actor.userPublicId,
      occurredAt: now,
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: { status: session.status },
      nextValue: {
        sessionPublicId: session.sessionPublicId,
        status,
        missingParticipantUserPublicIds,
      },
    })

    return closed
  }

  private assertSlot(sessionSlot: string): void {
    if (!/^[a-z0-9_-]{1,32}$/.test(sessionSlot)) {
      throw new DailyAlignmentValidationError("Invalid session slot.")
    }
  }

  private async requireWorkspaceRuntimeProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<NonNullable<Awaited<ReturnType<ProjectRuntimeService["findWorkspaceRuntimeProjectState"]>>>> {
    const row = await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!row) {
      throw new DailyAlignmentNotFoundError("Operational project not found.")
    }
    return row
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

  private async createSessionDocument(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
    operationalApproach: DailyAlignmentSessionState["operationalApproach"],
    operationalTimeZone: string,
    alignmentMode: DailyAlignmentMode,
  ): Promise<DailyAlignmentSessionState> {
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
      alignmentMode,
      facilitatorUserPublicId: null,
      status: "open",
      startedAt: now,
      closedAt: null,
      closeoutSummary: null,
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
  }

  private async ensureOpenSessionLazy(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
    operationalApproach: DailyAlignmentSessionState["operationalApproach"],
    operationalTimeZone: string,
    alignmentMode: DailyAlignmentMode,
  ): Promise<DailyAlignmentSessionState> {
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
      operationalApproach,
      operationalTimeZone,
      alignmentMode,
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
      category: "daily_alignment_session",
      action: "daily_alignment_session_created_lazy",
      actorUserPublicId: actor.userPublicId,
      occurredAt: new Date(),
      resource: { projectPublicId, backlogItemPublicId: null },
      previousValue: null,
      nextValue: { sessionPublicId: session.sessionPublicId, sessionDate, sessionSlot },
    })
    return session
  }

  private async resolveExpectedParticipantUserPublicIds(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<string[]> {
    const links = await this.workTeamProjectLinkRepository.listByProject(workspacePublicId, projectPublicId)
    const fromTeams = new Set<string>()
    for (const link of links) {
      const memberships = await this.workTeamMembershipRepository.listByTeam(link.teamPublicId, {
        activeOnly: true,
        workspacePublicId,
      })
      for (const m of memberships) {
        fromTeams.add(m.userPublicId)
      }
    }
    const allMembers = await this.workspaceMemberRepository.listByWorkspacePublicId(workspacePublicId)
    const eligible = (uid: string) => {
      const mem = allMembers.find((m) => m.userPublicId === uid)
      if (!mem || mem.status === "deactivated") return false
      const mr = mem.workspaceRoleMethodological
      return mr !== null && EXPECTED_METHODOLOGY.includes(mr)
    }

    if (fromTeams.size > 0) {
      return [...fromTeams].filter(eligible).sort()
    }
    return allMembers
      .filter(
        (m) =>
          m.status !== "deactivated" &&
          m.workspaceRoleMethodological !== null &&
          EXPECTED_METHODOLOGY.includes(m.workspaceRoleMethodological),
      )
      .map((m) => m.userPublicId)
      .sort()
  }
}
