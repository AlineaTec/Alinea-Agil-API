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
import type { ScrumSprintState } from "../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ProjectScrumSprintAssignmentState } from "../project-scrum-sprint-planning/domain/project-scrum-sprint-assignment.js"
import type { ScrumSprintPlanningRepository } from "../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { GuidedRefinementReviewedItemState } from "../guided-refinement/domain/guided-refinement-reviewed-item.js"
import type { GuidedRefinementReviewedItemRepository } from "../guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { GuidedSprintPlanningSessionRepository } from "./persistence/guided-sprint-planning-session.repository.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "./persistence/guided-sprint-planning-candidate-item.repository.js"
import type { GuidedSprintPlanningBaselineRepository } from "./persistence/guided-sprint-planning-baseline.repository.js"
import type { GuidedSprintPlanningSessionState } from "./domain/guided-sprint-planning-session.js"
import type { GuidedSprintPlanningCandidateItemState } from "./domain/guided-sprint-planning-candidate-item.js"
import type { GuidedSprintPlanningBaselineState } from "./domain/guided-sprint-planning-baseline.js"
import { P, W } from "../daily-alignment/daily-alignment.in-memory.fixtures.js"

export { W, P }

export const SPRINT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
export const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
export const ITEM2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
export const DATE = "2026-05-12"

export class GspTestRuntime
  implements Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState" | "requireScrumOrKanbanWorkspaceRuntimeProject">
{
  constructor(private readonly approach: OperationalApproach) {}

  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== W || projectPublicId !== P) return null
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
    if (!row) throw new ProjectRuntimeNotFoundError()
    if (row.operationalApproach !== "scrum" && row.operationalApproach !== "kanban") {
      throw new ProjectRuntimeInvalidInputError("Approach must be scrum or kanban.")
    }
    return row
  }

  async requireScrumWorkspaceRuntimeProject(workspacePublicId: string, projectPublicId: string) {
    const row = await this.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!row) throw new ProjectRuntimeNotFoundError()
    if (row.operationalApproach !== "scrum") {
      throw new ProjectRuntimeInvalidInputError("Approach must be scrum.")
    }
    return row
  }
}

export function backlogItemFixture(id: string): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: id,
    workspacePublicId: W,
    projectPublicId: P,
    itemType: "user_story",
    title: "Story",
    description: null,
    status: "open",
    priorityLevel: "medium",
    storyPoints: 3,
    sortOrder: 1,
    parentItemPublicId: null,
    assignedUserPublicId: null,
    completedInSprintPublicId: null,
    createdByUserPublicId: "u1",
    createdAt: now,
    updatedAt: now,
  }
}

export function sprintFixture(status: ScrumSprintState["status"] = "planning"): ScrumSprintState {
  const now = new Date()
  return {
    sprintPublicId: SPRINT,
    workspacePublicId: W,
    projectPublicId: P,
    name: "S1",
    goal: "",
    status,
    startDate: null,
    endDate: null,
    createdByUserPublicId: "u1",
    createdAt: now,
    updatedAt: now,
    closure: null,
    review: null,
    retrospective: null,
  }
}

export class MemGspSession implements GuidedSprintPlanningSessionRepository {
  sessions = new Map<string, GuidedSprintPlanningSessionState>()

  private sprintKey(ws: string, proj: string, sprintId: string) {
    return `sprint|${ws}|${proj}|${sprintId}`
  }

  private flowKey(ws: string, proj: string, date: string, slot: string) {
    return `flow|${ws}|${proj}|${date}|${slot}`
  }

  private storeKey(s: GuidedSprintPlanningSessionState) {
    return s.sprintPublicId
      ? this.sprintKey(s.workspacePublicId, s.projectPublicId, s.sprintPublicId)
      : this.flowKey(s.workspacePublicId, s.projectPublicId, s.sessionDate, s.sessionSlot)
  }

  async findBySprintPublicId(ws: string, proj: string, sprintId: string) {
    return this.sessions.get(this.sprintKey(ws, proj, sprintId)) ?? null
  }

  async findByFlowKey(ws: string, proj: string, date: string, slot: string) {
    return this.sessions.get(this.flowKey(ws, proj, date, slot)) ?? null
  }

  async findByPublicId(ws: string, proj: string, sessionPublicId: string) {
    return (
      [...this.sessions.values()].find(
        (x) => x.workspacePublicId === ws && x.projectPublicId === proj && x.sessionPublicId === sessionPublicId,
      ) ?? null
    )
  }

  async insert(state: GuidedSprintPlanningSessionState): Promise<void> {
    const k = this.storeKey(state)
    if (this.sessions.has(k)) throw Object.assign(new Error("dup"), { code: 11000 })
    this.sessions.set(k, {
      ...state,
      transcriptAfterClose: state.transcriptAfterClose ? { ...state.transcriptAfterClose } : null,
    })
  }

  async updateHeaderIfOpen(
    ws: string,
    proj: string,
    sessionPublicId: string,
    patch: Parameters<GuidedSprintPlanningSessionRepository["updateHeaderIfOpen"]>[3],
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || s.status !== "open") return null
    const next = { ...s, ...patch }
    this.sessions.set(this.storeKey(next), next)
    return next
  }

  async updateCounts(
    ws: string,
    proj: string,
    sessionPublicId: string,
    counts: Parameters<GuidedSprintPlanningSessionRepository["updateCounts"]>[3],
  ): Promise<void> {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s) return
    const next = { ...s, ...counts }
    this.sessions.set(this.storeKey(next), next)
  }

  async updateCloseoutAndStatus(
    ws: string,
    proj: string,
    sessionPublicId: string,
    patch: Parameters<GuidedSprintPlanningSessionRepository["updateCloseoutAndStatus"]>[3],
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || s.status !== "open") return null
    const next = { ...s, ...patch }
    this.sessions.set(this.storeKey(next), next)
    return next
  }

  async appendAdditiveNoteAfterClose(ws: string, proj: string, sessionPublicId: string, note: string, updatedAt: Date) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || s.status === "open") return null
    const next = {
      ...s,
      additiveNotesAfterClose: [...s.additiveNotesAfterClose, note],
      updatedAt,
    }
    this.sessions.set(this.storeKey(next), next)
    return next
  }

  async upsertTranscriptAfterClose(
    ws: string,
    proj: string,
    sessionPublicId: string,
    transcript: GuidedSprintPlanningSessionState["transcriptAfterClose"],
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || s.status === "open") return null
    const next = { ...s, transcriptAfterClose: transcript, updatedAt }
    this.sessions.set(this.storeKey(next), next)
    return next
  }

  async listRecentForProject(ws: string, proj: string, limit: number) {
    return [...this.sessions.values()]
      .filter((s) => s.workspacePublicId === ws && s.projectPublicId === proj)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
  }

  async listForProjectSessionDateRange(
    ws: string,
    proj: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ) {
    return [...this.sessions.values()]
      .filter(
        (s) =>
          s.workspacePublicId === ws &&
          s.projectPublicId === proj &&
          s.sessionDate >= sessionDateFromInclusive &&
          s.sessionDate <= sessionDateToInclusive,
      )
      .sort((a, b) => {
        const d = a.sessionDate.localeCompare(b.sessionDate)
        if (d !== 0) return d
        const sl = a.sessionSlot.localeCompare(b.sessionSlot)
        if (sl !== 0) return sl
        return a.updatedAt.getTime() - b.updatedAt.getTime()
      })
  }
}

export class MemGspCandidates implements GuidedSprintPlanningCandidateItemRepository {
  items = new Map<string, GuidedSprintPlanningCandidateItemState>()

  private key(ws: string, proj: string, sessionId: string, workItemId: string) {
    return `${ws}|${proj}|${sessionId}|${workItemId}`
  }

  async findBySessionAndWorkItem(ws: string, proj: string, sessionId: string, workItemId: string) {
    return this.items.get(this.key(ws, proj, sessionId, workItemId)) ?? null
  }

  async listBySession(ws: string, proj: string, sessionId: string) {
    return [...this.items.values()].filter(
      (i) => i.workspacePublicId === ws && i.projectPublicId === proj && i.sessionPublicId === sessionId,
    )
  }

  async upsert(state: GuidedSprintPlanningCandidateItemState): Promise<void> {
    this.items.set(
      this.key(state.workspacePublicId, state.projectPublicId, state.sessionPublicId, state.workItemPublicId),
      { ...state },
    )
  }

  async deleteBySessionAndWorkItem(ws: string, proj: string, sessionId: string, workItemId: string) {
    return this.items.delete(this.key(ws, proj, sessionId, workItemId))
  }
}

export class MemGspBaseline implements GuidedSprintPlanningBaselineRepository {
  baselines: GuidedSprintPlanningBaselineState[] = []

  async insert(state: GuidedSprintPlanningBaselineState): Promise<void> {
    if (this.baselines.some((b) => b.sessionPublicId === state.sessionPublicId)) {
      throw Object.assign(new Error("dup"), { code: 11000 })
    }
    this.baselines.push({ ...state })
  }

  async findBySessionPublicId(ws: string, proj: string, sessionPublicId: string) {
    return this.baselines.find((b) => b.workspacePublicId === ws && b.projectPublicId === proj && b.sessionPublicId === sessionPublicId) ?? null
  }

  async findLatestBySprintPublicId(ws: string, proj: string, sprintPublicId: string) {
    const rows = this.baselines
      .filter((b) => b.workspacePublicId === ws && b.projectPublicId === proj && b.sprintPublicId === sprintPublicId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return rows[0] ?? null
  }
}

export class MemBacklog implements Pick<ScrumBacklogRepository, "findByProjectAndItemId" | "listByProject"> {
  constructor(private readonly map: Map<string, ScrumBacklogItemState>) {}

  async findByProjectAndItemId(ws: string, proj: string, id: string) {
    return this.map.get(`${ws}|${proj}|${id}`) ?? null
  }

  async listByProject(ws: string, proj: string) {
    return [...this.map.values()].filter((i) => i.workspacePublicId === ws && i.projectPublicId === proj)
  }
}

export class MemSprintRepo implements Pick<
  ScrumSprintPlanningRepository,
  | "listSprintsByProject"
  | "findSprintByPublicId"
  | "insertMembership"
  | "findMembership"
  | "deleteMembership"
  | "maxSprintSortOrder"
> {
  sprints: ScrumSprintState[] = []
  memberships: ProjectScrumSprintAssignmentState[] = []

  constructor(sprints: ScrumSprintState[] = [sprintFixture()]) {
    this.sprints = sprints
  }

  async listSprintsByProject(ws: string, proj: string) {
    return this.sprints.filter((s) => s.workspacePublicId === ws && s.projectPublicId === proj)
  }

  async findSprintByPublicId(ws: string, proj: string, sprintId: string) {
    return this.sprints.find((s) => s.workspacePublicId === ws && s.projectPublicId === proj && s.sprintPublicId === sprintId) ?? null
  }

  async insertMembership(m: ProjectScrumSprintAssignmentState): Promise<void> {
    const exists = this.memberships.some(
      (x) =>
        x.workspacePublicId === m.workspacePublicId &&
        x.projectPublicId === m.projectPublicId &&
        x.sprintPublicId === m.sprintPublicId &&
        x.backlogItemPublicId === m.backlogItemPublicId,
    )
    if (exists) throw Object.assign(new Error("dup"), { code: 11000 })
    this.memberships.push({ ...m })
  }

  async findMembership(ws: string, proj: string, sprintId: string, itemId: string) {
    return (
      this.memberships.find(
        (m) =>
          m.workspacePublicId === ws &&
          m.projectPublicId === proj &&
          m.sprintPublicId === sprintId &&
          m.backlogItemPublicId === itemId,
      ) ?? null
    )
  }

  async deleteMembership(ws: string, proj: string, sprintId: string, itemId: string): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) =>
        !(
          m.workspacePublicId === ws &&
          m.projectPublicId === proj &&
          m.sprintPublicId === sprintId &&
          m.backlogItemPublicId === itemId
        ),
    )
  }

  async maxSprintSortOrder(ws: string, proj: string, sprintId: string) {
    const orders = this.memberships
      .filter((m) => m.workspacePublicId === ws && m.projectPublicId === proj && m.sprintPublicId === sprintId)
      .map((m) => m.sprintSortOrder)
    return orders.length === 0 ? 0 : Math.max(...orders)
  }

  async listMembershipRowsForBacklogItemInProject(ws: string, proj: string, itemId: string) {
    return this.memberships.filter(
      (m) => m.workspacePublicId === ws && m.projectPublicId === proj && m.backlogItemPublicId === itemId,
    )
  }

  async listMembershipsBySprintOrdered(ws: string, proj: string, sprintId: string) {
    return this.memberships
      .filter((m) => m.workspacePublicId === ws && m.projectPublicId === proj && m.sprintPublicId === sprintId)
      .sort((a, b) => a.sprintSortOrder - b.sprintSortOrder)
  }

  async replaceSprint(next: ScrumSprintState): Promise<void> {
    const idx = this.sprints.findIndex((s) => s.sprintPublicId === next.sprintPublicId)
    if (idx >= 0) this.sprints[idx] = next
  }
}

export class MemRefinementReviews implements GuidedRefinementReviewedItemRepository {
  reviews: GuidedRefinementReviewedItemState[] = []

  async findBySessionAndWorkItem() {
    return null
  }

  async listBySession() {
    return []
  }

  async upsert() {}

  async findLatestForWorkItemInProject(ws: string, proj: string, workItemId: string) {
    const rows = this.reviews
      .filter((r) => r.workspacePublicId === ws && r.projectPublicId === proj && r.workItemPublicId === workItemId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return rows[0] ?? null
  }

  async countDistinctWorkItemsLatestReadyForPlanning(ws: string, proj: string): Promise<number> {
    const latest = new Map<string, GuidedRefinementReviewedItemState>()
    for (const row of this.reviews.filter((r) => r.workspacePublicId === ws && r.projectPublicId === proj)) {
      const prev = latest.get(row.workItemPublicId)
      if (!prev || row.sessionDate > prev.sessionDate || row.updatedAt > prev.updatedAt) {
        latest.set(row.workItemPublicId, row)
      }
    }
    let count = 0
    for (const row of latest.values()) {
      if (row.reviewStatus === "reviewed" && row.readyForPlanning) count++
    }
    return count
  }
}
