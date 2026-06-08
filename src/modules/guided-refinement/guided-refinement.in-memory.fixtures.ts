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
import type { GuidedRefinementSessionRepository } from "./persistence/guided-refinement-session.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "./persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedRefinementSessionState } from "./domain/guided-refinement-session.js"
import type { GuidedRefinementReviewedItemState } from "./domain/guided-refinement-reviewed-item.js"
import { P, W } from "../daily-alignment/daily-alignment.in-memory.fixtures.js"

export { W, P }

export class GuidedTestRuntime
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

export class MemGuidedSession implements GuidedRefinementSessionRepository {
  sessions = new Map<string, GuidedRefinementSessionState>()

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

  async insert(state: GuidedRefinementSessionState): Promise<void> {
    const k = this.keyByParts(
      state.workspacePublicId,
      state.projectPublicId,
      state.sessionDate,
      state.sessionSlot,
    )
    if (this.sessions.has(k)) {
      throw Object.assign(new Error("dup"), { code: 11000 })
    }
    this.sessions.set(k, { ...state })
  }

  async updateHeaderIfOpen(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRefinementSessionRepository["updateHeaderIfOpen"]>[3],
  ) {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s || s.status !== "open") return null
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    const next = {
      ...s,
      ...patch,
    }
    this.sessions.set(k, next)
    return next
  }

  async updateCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: Parameters<GuidedRefinementSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    const s = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!s) return
    const k = this.keyByParts(workspacePublicId, projectPublicId, s.sessionDate, s.sessionSlot)
    this.sessions.set(k, {
      ...s,
      reviewedItemCount: counts.reviewedItemCount,
      readyForPlanningCount: counts.readyForPlanningCount,
      pendingCandidateReviewCount: counts.pendingCandidateReviewCount,
      reviewedNotReadyCount: counts.reviewedNotReadyCount,
      updatedAt: counts.updatedAt,
    })
  }

  async updateCloseoutAndStatus(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRefinementSessionRepository["updateCloseoutAndStatus"]>[3],
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
    note: string,
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

export class MemGuidedReviewedItems implements GuidedRefinementReviewedItemRepository {
  items = new Map<string, GuidedRefinementReviewedItemState>()

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

  async upsert(state: GuidedRefinementReviewedItemState): Promise<void> {
    this.items.set(
      this.key(state.workspacePublicId, state.projectPublicId, state.sessionPublicId, state.workItemPublicId),
      { ...state },
    )
  }

  async findLatestForWorkItemInProject(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ) {
    const rows = [...this.items.values()].filter(
      (x) =>
        x.workspacePublicId === workspacePublicId &&
        x.projectPublicId === projectPublicId &&
        x.workItemPublicId === workItemPublicId,
    )
    if (rows.length === 0) return null
    rows.sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))
    const topDate = rows[0]!.sessionDate
    const same = rows.filter((r) => r.sessionDate === topDate)
    same.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return same[0] ?? null
  }
}

export function backlogItemFixture(id: string, opts: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
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
    ...opts,
  }
}

export class MemBacklog implements Pick<ScrumBacklogRepository, "findByProjectAndItemId"> {
  constructor(private readonly items: Map<string, ScrumBacklogItemState>) {}

  async findByProjectAndItemId(workspacePublicId: string, projectPublicId: string, backlogItemPublicId: string) {
    const k = `${workspacePublicId}|${projectPublicId}|${backlogItemPublicId}`
    return this.items.get(k) ?? null
  }
}
