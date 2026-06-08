import { randomUUID } from "node:crypto"
import { defaultInitialConfigurationSummary } from "../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { OperationalApproach } from "../workspace-project-runtime/domain/operational-approach.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumBacklogItemState } from "../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { GuidedReviewSessionRepository } from "./persistence/guided-review-session.repository.js"
import type { GuidedReviewDemonstratedItemRepository } from "./persistence/guided-review-demonstrated-item.repository.js"
import type { GuidedReviewFeedbackRepository } from "./persistence/guided-review-feedback.repository.js"
import type { GuidedReviewSessionState, GuidedReviewAdditiveNote } from "./domain/guided-review-session.js"
import type { GuidedReviewDemonstratedItemState } from "./domain/guided-review-demonstrated-item.js"
import type { GuidedReviewFeedbackState } from "./domain/guided-review-feedback.js"
import { W, P } from "../daily-alignment/daily-alignment.in-memory.fixtures.js"

export { W, P }

export class GuidedReviewTestRuntime
  implements
    Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState" | "requireScrumOrKanbanWorkspaceRuntimeProject">
{
  constructor(private readonly approach: OperationalApproach) {}

  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== W || projectPublicId !== P) {
      return null
    }
    const now = new Date()
    return {
      projectPublicId: P,
      workspacePublicId: W,
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

  async requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId: string, projectPublicId: string) {
    const row = await this.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!row) {
      throw new ProjectRuntimeNotFoundError()
    }
    if (row.operationalApproach !== "scrum" && row.operationalApproach !== "kanban") {
      throw new ProjectRuntimeInvalidInputError("Approach must be scrum or kanban.")
    }
    return row
  }
}

export class MemGuidedReviewSession implements GuidedReviewSessionRepository {
  sessions = new Map<string, GuidedReviewSessionState>()

  private keyByParts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ) {
    return `${workspacePublicId}|${projectPublicId}|${sessionDate}|${sessionSlot}`
  }

  async findByKey(workspacePublicId: string, projectPublicId: string, sessionDate: string, sessionSlot: string) {
    return this.sessions.get(this.keyByParts(workspacePublicId, projectPublicId, sessionDate, sessionSlot)) ?? null
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

  async insert(state: GuidedReviewSessionState): Promise<void> {
    const k = this.keyByParts(
      state.workspacePublicId,
      state.projectPublicId,
      state.sessionDate,
      state.sessionSlot,
    )
    if (this.sessions.has(k)) {
      throw Object.assign(new Error("dup"), { code: 11000 })
    }
    this.sessions.set(k, {
      ...state,
      additiveNotesAfterClose: [...state.additiveNotesAfterClose],
      transcriptAfterClose: state.transcriptAfterClose ? { ...state.transcriptAfterClose } : null,
    })
  }

  async updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedReviewSessionRepository["updateHeaderIfOpen"]>[3],
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status !== "open") return null
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    const next = { ...s, ...patch }
    this.sessions.set(k, next)
    return next
  }

  async updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: Parameters<GuidedReviewSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s) return
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    this.sessions.set(k, {
      ...s,
      demonstratedItemCount: counts.demonstratedItemCount,
      feedbackCount: counts.feedbackCount,
      backlogImpactCount: counts.backlogImpactCount,
      updatedAt: counts.updatedAt,
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedReviewSessionRepository["updateCloseoutAndStatus"]>[3],
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status !== "open") return null
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    const next = { ...s, ...patch }
    this.sessions.set(k, next)
    return next
  }

  async appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: GuidedReviewAdditiveNote,
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status === "open") return null
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    const next = {
      ...s,
      additiveNotesAfterClose: [...s.additiveNotesAfterClose, note],
      updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }

  async upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedReviewSessionState["transcriptAfterClose"],
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status === "open") return null
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    const next = {
      ...s,
      transcriptAfterClose: transcript,
      updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }

  async listRecentForProject(workspacePublicId: string, projectPublicId: string, limit: number) {
    return [...this.sessions.values()]
      .filter((s) => s.workspacePublicId === workspacePublicId && s.projectPublicId === projectPublicId)
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))
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
        (s) =>
          s.workspacePublicId === workspacePublicId &&
          s.projectPublicId === projectPublicId &&
          s.sessionDate >= sessionDateFromInclusive &&
          s.sessionDate <= sessionDateToInclusive,
      )
      .sort((a, b) => {
        if (a.sessionDate < b.sessionDate) return -1
        if (a.sessionDate > b.sessionDate) return 1
        if (a.sessionSlot < b.sessionSlot) return -1
        if (a.sessionSlot > b.sessionSlot) return 1
        return a.updatedAt.getTime() - b.updatedAt.getTime()
      })
  }
}

export class MemGuidedReviewDemonstratedItems implements GuidedReviewDemonstratedItemRepository {
  items = new Map<string, GuidedReviewDemonstratedItemState>()

  private key(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ) {
    return `${workspacePublicId}|${projectPublicId}|${sessionPublicId}|${workItemPublicId}`
  }

  async findBySessionAndWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    workItemPublicId: string,
  ) {
    return this.items.get(this.key(workspacePublicId, projectPublicId, sessionPublicId, workItemPublicId)) ?? null
  }

  async listBySession(workspacePublicId: string, projectPublicId: string, sessionPublicId: string) {
    return [...this.items.values()].filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.sessionPublicId === sessionPublicId,
    )
  }

  async upsert(state: GuidedReviewDemonstratedItemState): Promise<void> {
    this.items.set(
      this.key(state.workspacePublicId, state.projectPublicId, state.sessionPublicId, state.workItemPublicId),
      { ...state },
    )
  }

  async findLatestForWorkItemInProject(workspacePublicId: string, projectPublicId: string, workItemPublicId: string) {
    const rows = [...this.items.values()].filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.workItemPublicId === workItemPublicId,
    )
    if (rows.length === 0) return null
    rows.sort((a, b) => {
      if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? 1 : -1
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    const top = rows[0]!
    return { item: top, sessionPublicId: top.sessionPublicId, sessionDate: top.sessionDate }
  }
}

export class MemGuidedReviewFeedback implements GuidedReviewFeedbackRepository {
  rows = new Map<string, GuidedReviewFeedbackState>()

  async insert(state: GuidedReviewFeedbackState): Promise<void> {
    this.rows.set(state.feedbackEntryPublicId, { ...state })
  }

  async listBySession(workspacePublicId: string, projectPublicId: string, sessionPublicId: string) {
    return [...this.rows.values()]
      .filter(
        (x) =>
          x.workspacePublicId === workspacePublicId &&
          x.projectPublicId === projectPublicId &&
          x.sessionPublicId === sessionPublicId,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
}

export function backlogItem(id: string): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: id,
    workspacePublicId: W,
    projectPublicId: P,
    itemType: "user_story",
    title: "Story",
    description: "",
    status: "backlog",
    sortOrder: 1,
    parentItemPublicId: null,
    createdByUserPublicId: "u1",
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "normal",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
  }
}

export class MemBacklogPick implements Pick<ScrumBacklogRepository, "findByProjectAndItemId"> {
  constructor(private readonly items: Map<string, ScrumBacklogItemState>) {}

  async findByProjectAndItemId(workspacePublicId: string, projectPublicId: string, backlogItemPublicId: string) {
    const k = `${workspacePublicId}|${projectPublicId}|${backlogItemPublicId}`
    return this.items.get(k) ?? null
  }
}
