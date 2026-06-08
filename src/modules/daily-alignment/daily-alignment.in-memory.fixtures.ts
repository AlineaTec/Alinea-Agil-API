import { randomUUID } from "node:crypto"
import { defaultInitialConfigurationSummary } from "../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { OperationalApproach } from "../workspace-project-runtime/domain/operational-approach.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkItemTimeEntriesRepository } from "../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import type { DailyAlignmentSessionRepository } from "./persistence/daily-alignment-session.repository.js"
import type { DailyAlignmentParticipantUpdateRepository } from "./persistence/daily-alignment-participant-update.repository.js"
import type { WorkTeamProjectLinkRepository } from "../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamMembershipRepository } from "../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"
import type { DailyAlignmentParticipantUpdateState, DailyAlignmentSessionState } from "./domain/daily-alignment-session.js"
import type { UpsertDailyAlignmentParticipantInput } from "./persistence/daily-alignment-participant-update.repository.js"

/** Workspace / proyecto usados en pruebas de daily-alignment. */
export const DAILY_ALIGNMENT_FIXTURE_WORKSPACE = "11111111-1111-4111-8111-111111111111"
export const DAILY_ALIGNMENT_FIXTURE_PROJECT = "22222222-2222-4222-8222-222222222222"

/** Alias corto para tests. */
export const W = DAILY_ALIGNMENT_FIXTURE_WORKSPACE
export const P = DAILY_ALIGNMENT_FIXTURE_PROJECT

export class MemSession implements DailyAlignmentSessionRepository {
  sessions = new Map<string, DailyAlignmentSessionState>()
  key(s: DailyAlignmentSessionState) {
    return `${s.workspacePublicId}|${s.projectPublicId}|${s.sessionDate}|${s.sessionSlot}`
  }
  async findByKey(workspacePublicId: string, projectPublicId: string, sessionDate: string, sessionSlot: string) {
    return (
      [...this.sessions.values()].find(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.sessionDate === sessionDate &&
          x.sessionSlot === sessionSlot,
      ) ?? null
    )
  }
  async findByPublicId(workspacePublicId: string, projectPublicId: string, sessionPublicId: string) {
    return (
      [...this.sessions.values()].find(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.sessionPublicId === sessionPublicId,
      ) ?? null
    )
  }
  async insert(state: DailyAlignmentSessionState): Promise<void> {
    const k = this.key(state)
    if (this.sessions.has(k)) throw Object.assign(new Error("dup"), { code: 11000 })
    this.sessions.set(k, { ...state })
  }
  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<DailyAlignmentSessionRepository["updateCloseoutAndStatus"]>[3],
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s) return null
    const k = this.key(s)
    const next = {
      ...s,
      status: patch.status,
      closedAt: patch.closedAt,
      closeoutSummary: patch.closeoutSummary,
      agreements: patch.agreements,
      escalatedImpediments: patch.escalatedImpediments,
      followUps: patch.followUps,
      facilitatorUserPublicId: patch.facilitatorUserPublicId,
      updatedAt: patch.updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }
  async updateFacilitatorTranscriptIfClosed(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    facilitatorTranscript: string | null,
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || (s.status !== "closed" && s.status !== "closed_incomplete")) return null
    const k = this.key(s)
    const next = { ...s, facilitatorTranscript, updatedAt }
    this.sessions.set(k, next)
    return next
  }
  async updateAlignmentModeIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    alignmentMode: DailyAlignmentSessionState["alignmentMode"],
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status !== "open") return null
    const k = this.key(s)
    const next = { ...s, alignmentMode, updatedAt }
    this.sessions.set(k, next)
    return next
  }
  async listRecentForProject(workspacePublicId: string, projectPublicId: string, limit: number) {
    return [...this.sessions.values()]
      .filter((x) => x.workspacePublicId === workspacePublicId && x.projectPublicId === projectPublicId)
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .slice(0, limit)
  }
  async listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ) {
    return [...this.sessions.values()]
      .filter(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.sessionDate >= sessionDateFromInclusive &&
          x.sessionDate <= sessionDateToInclusive,
      )
      .sort((a, b) => {
        const c = a.sessionDate.localeCompare(b.sessionDate)
        if (c !== 0) return c
        return a.sessionSlot.localeCompare(b.sessionSlot)
      })
  }
}

export class MemParticipant implements DailyAlignmentParticipantUpdateRepository {
  rows = new Map<string, DailyAlignmentParticipantUpdateState>()
  pk(sessionPublicId: string, userPublicId: string) {
    return `${sessionPublicId}|${userPublicId}`
  }
  async findBySessionAndUser(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
  ) {
    return (
      [...this.rows.values()].find(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.sessionPublicId === sessionPublicId &&
          x.userPublicId === userPublicId,
      ) ?? null
    )
  }
  async listBySession(workspacePublicId: string, projectPublicId: string, sessionPublicId: string) {
    return [...this.rows.values()].filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.sessionPublicId === sessionPublicId,
    )
  }
  async upsert(input: UpsertDailyAlignmentParticipantInput) {
    const k = this.pk(input.sessionPublicId, input.userPublicId)
    const row: DailyAlignmentParticipantUpdateState = {
      participantUpdatePublicId: input.participantUpdatePublicId,
      sessionPublicId: input.sessionPublicId,
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      userPublicId: input.userPublicId,
      yesterdaySummary: input.yesterdaySummary,
      todayPlan: input.todayPlan,
      impediments: input.impediments,
      suggestionBasisSnapshot: input.suggestionBasisSnapshot,
      consistencyHintsSnapshot: input.consistencyHintsSnapshot,
      sourceMode: input.sourceMode,
      isSubmitted: input.isSubmitted,
      submittedAt: input.submittedAt,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }
    this.rows.set(k, row)
    return row
  }
}

export class MemTime implements WorkItemTimeEntriesRepository {
  constructor(public minutes = 0) {}
  async insert(): Promise<void> {}
  async findByIds(): Promise<null> {
    return null
  }
  async listPage() {
    return []
  }
  async getSummaryForItem() {
    return {
      workItemPublicId: "x",
      totalLoggedMinutes: 0,
      entryCount: 0,
      lastLoggedAt: null,
      lastTimeEntryByUserPublicId: null,
    }
  }
  async update(): Promise<null> {
    return null
  }
  async delete(): Promise<boolean> {
    return false
  }
  async sumMinutesForUserProjectWorkDateRange(): Promise<number> {
    return this.minutes
  }
  async aggregateMinutesByDevelopersForProjectWorkDateRange(): Promise<{ userPublicId: string; totalMinutes: number }[]> {
    return []
  }
}

export class MemAudit implements WorkspaceAuditLogRepository {
  count = 0
  async append(): Promise<void> {}
  async listForProject() {
    return []
  }
  async countForProjectUserInWindow(): Promise<number> {
    return this.count
  }
}

export class FakeProjectRuntime implements Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState"> {
  constructor(private readonly approach: OperationalApproach) {}
  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== DAILY_ALIGNMENT_FIXTURE_WORKSPACE || projectPublicId !== DAILY_ALIGNMENT_FIXTURE_PROJECT) {
      return null
    }
    const now = new Date()
    return {
      projectPublicId: DAILY_ALIGNMENT_FIXTURE_PROJECT,
      workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
      sourceDraftPublicId: randomUUID(),
      projectName: "T",
      operationalApproach: this.approach,
      initialConfigurationSummary: defaultInitialConfigurationSummary(this.approach),
      status: "active" as const,
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }
}

export class EmptySprint implements Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> {
  async listSprintsByProject() {
    return []
  }
}

export class MemWorkspaceMembers implements Pick<WorkspaceMemberRepository, "listByWorkspacePublicId"> {
  constructor(
    private readonly members: import("../workspace-users/domain/workspace-member.js").WorkspaceMemberState[],
  ) {}
  async listByWorkspacePublicId() {
    return this.members
  }
}

export class EmptyTeamLink implements Pick<WorkTeamProjectLinkRepository, "listByProject"> {
  async listByProject() {
    return []
  }
}

export class EmptyTeamMembership implements Pick<WorkTeamMembershipRepository, "listByTeam"> {
  async listByTeam() {
    return []
  }
}
