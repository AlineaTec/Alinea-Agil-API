import { randomUUID } from "node:crypto"
import { defaultInitialConfigurationSummary } from "../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { OperationalApproach } from "../workspace-project-runtime/domain/operational-approach.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeService } from "../workspace-project-runtime/services/project-runtime.service.js"
import type { GuidedRetrospectiveSessionRepository } from "./persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveTopicRepository } from "./persistence/guided-retrospective-topic.repository.js"
import type { GuidedRetrospectiveContributionRepository } from "./persistence/guided-retrospective-contribution.repository.js"
import type { GuidedRetrospectiveVoteRepository } from "./persistence/guided-retrospective-vote.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "./persistence/guided-retrospective-action-item.repository.js"
import type {
  GuidedRetrospectiveSessionState,
  GuidedRetrospectiveAdditiveNote,
} from "./domain/guided-retrospective-session.js"
import type { GuidedRetrospectiveTopicState } from "./domain/guided-retrospective-topic.js"
import type { GuidedRetrospectiveContributionState } from "./domain/guided-retrospective-contribution.js"
import type { GuidedRetrospectiveVoteState } from "./domain/guided-retrospective-vote.js"
import type { GuidedRetrospectiveActionItemState } from "./domain/guided-retrospective-action-item.js"
import { W, P } from "../daily-alignment/daily-alignment.in-memory.fixtures.js"

export { W, P }

const OPEN: GuidedRetrospectiveSessionState["status"][] = [
  "planned",
  "open",
  "collecting",
  "voting",
  "closing",
]
const CLOSED: GuidedRetrospectiveSessionState["status"][] = ["closed", "closed_without_actions"]

export class GuidedRetrospectiveTestRuntime
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

export class MemGuidedRetrospectiveSession implements GuidedRetrospectiveSessionRepository {
  sessions = new Map<string, GuidedRetrospectiveSessionState>()

  private key(ws: string, proj: string, date: string, slot: string) {
    return `${ws}|${proj}|${date}|${slot}`
  }

  async findByKey(ws: string, proj: string, date: string, slot: string) {
    return this.sessions.get(this.key(ws, proj, date, slot)) ?? null
  }

  async findByPublicId(ws: string, proj: string, sessionPublicId: string) {
    return (
      [...this.sessions.values()].find(
        (x) => x.workspacePublicId === ws && x.projectPublicId === proj && x.sessionPublicId === sessionPublicId,
      ) ?? null
    )
  }

  async findOpenBySessionCodeInWorkspace(ws: string, sessionCode: string) {
    return (
      [...this.sessions.values()].find(
        (x) => x.workspacePublicId === ws && x.sessionCode === sessionCode && OPEN.includes(x.status),
      ) ?? null
    )
  }

  async findOpenBySessionCodeGlobally(sessionCode: string) {
    const matches = [...this.sessions.values()].filter(
      (x) => x.sessionCode === sessionCode && OPEN.includes(x.status),
    )
    if (matches.length === 0) return null
    matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return matches[0] ?? null
  }

  async insert(state: GuidedRetrospectiveSessionState): Promise<void> {
    const k = this.key(state.workspacePublicId, state.projectPublicId, state.sessionDate, state.sessionSlot)
    if (this.sessions.has(k)) {
      throw Object.assign(new Error("dup"), { code: 11000 })
    }
    this.sessions.set(k, clone(state))
  }

  async updateHeaderWhenWritable(
    ws: string,
    proj: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRetrospectiveSessionRepository["updateHeaderWhenWritable"]>[3],
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || !OPEN.includes(s.status)) return null
    const k = this.key(ws, proj, s.sessionDate, s.sessionSlot)
    const next: GuidedRetrospectiveSessionState = { ...s }
    for (const _key of Object.keys(patch) as (keyof typeof patch)[]) {
      const key = _key
      const val = patch[key]
      if (val === undefined) continue
      if (key === "participantUserPublicIds") {
        next.participantUserPublicIds = [...(val as string[])]
      } else if (key === "participantWithContributionUserPublicIds") {
        next.participantWithContributionUserPublicIds = [...(val as string[])]
      } else if (key === "updatedAt") {
        next.updatedAt = val as Date
      } else {
        ;(next as Record<string, unknown>)[key as string] = val
      }
    }
    this.sessions.set(k, next)
    return next
  }

  async updateDenormalizedCounts(
    ws: string,
    proj: string,
    sessionPublicId: string,
    counts: Parameters<GuidedRetrospectiveSessionRepository["updateDenormalizedCounts"]>[3],
  ): Promise<void> {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s) return
    const k = this.key(ws, proj, s.sessionDate, s.sessionSlot)
    this.sessions.set(k, {
      ...s,
      contributionCount: counts.contributionCount,
      topicCount: counts.topicCount,
      voteRecordCount: counts.voteRecordCount,
      sessionVoteStickerTotal: counts.sessionVoteStickerTotal,
      participantCount: counts.participantCount,
      participantWithContributionCount: counts.participantWithContributionCount,
      updatedAt: counts.updatedAt,
    })
  }

  async closeSession(
    ws: string,
    proj: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRetrospectiveSessionRepository["closeSession"]>[3],
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || !OPEN.includes(s.status)) return null
    const k = this.key(ws, proj, s.sessionDate, s.sessionSlot)
    const next: GuidedRetrospectiveSessionState = {
      ...s,
      status: patch.status,
      closedAt: patch.closedAt,
      summary: patch.summary,
      agreements: [...patch.agreements],
      facilitatorUserPublicId: patch.facilitatorUserPublicId,
      sessionCode: patch.sessionCode,
      updatedAt: patch.updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }

  async appendAdditiveNoteAfterClose(
    ws: string,
    proj: string,
    sessionPublicId: string,
    note: GuidedRetrospectiveAdditiveNote,
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || !CLOSED.includes(s.status)) return null
    const k = this.key(ws, proj, s.sessionDate, s.sessionSlot)
    const next = {
      ...s,
      additiveNotesAfterClose: [...s.additiveNotesAfterClose, note],
      updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }

  async upsertTranscriptAfterClose(
    ws: string,
    proj: string,
    sessionPublicId: string,
    transcript: Parameters<GuidedRetrospectiveSessionRepository["upsertTranscriptAfterClose"]>[3],
    updatedAt: Date,
  ) {
    const s = await this.findByPublicId(ws, proj, sessionPublicId)
    if (!s || !CLOSED.includes(s.status)) return null
    const k = this.key(ws, proj, s.sessionDate, s.sessionSlot)
    const next = {
      ...s,
      transcriptAfterClose: transcript,
      updatedAt,
    }
    this.sessions.set(k, next)
    return next
  }

  async listRecentForProject(ws: string, proj: string, limit: number) {
    return [...this.sessions.values()]
      .filter((s) => s.workspacePublicId === ws && s.projectPublicId === proj)
      .sort((a, b) => {
        if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? 1 : -1
        if (a.sessionSlot !== b.sessionSlot) return a.sessionSlot < b.sessionSlot ? 1 : -1
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })
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
        if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? -1 : 1
        if (a.sessionSlot !== b.sessionSlot) return a.sessionSlot < b.sessionSlot ? -1 : 1
        return a.updatedAt.getTime() - b.updatedAt.getTime()
      })
  }
}

function clone(s: GuidedRetrospectiveSessionState): GuidedRetrospectiveSessionState {
  return {
    ...s,
    agreements: [...s.agreements],
    participantUserPublicIds: [...s.participantUserPublicIds],
    participantWithContributionUserPublicIds: [...s.participantWithContributionUserPublicIds],
    transcriptAfterClose: s.transcriptAfterClose ? { ...s.transcriptAfterClose } : null,
    additiveNotesAfterClose: s.additiveNotesAfterClose.map((n) => ({ ...n })),
    contextHints: s.contextHints ? { ...s.contextHints } : null,
  }
}

export class MemGuidedRetrospectiveTopics implements GuidedRetrospectiveTopicRepository {
  topics = new Map<string, GuidedRetrospectiveTopicState>()

  async listBySession(ws: string, proj: string, sessionPublicId: string) {
    return [...this.topics.values()]
      .filter((t) => t.workspacePublicId === ws && t.projectPublicId === proj && t.sessionPublicId === sessionPublicId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
  }

  async findByPublicId(ws: string, proj: string, topicPublicId: string) {
    const t = this.topics.get(topicPublicId) ?? null
    if (!t || t.workspacePublicId !== ws || t.projectPublicId !== proj) return null
    return t
  }

  async insert(topic: GuidedRetrospectiveTopicState): Promise<void> {
    this.topics.set(topic.topicPublicId, { ...topic })
  }

  async updateTitleAndSort(
    ws: string,
    proj: string,
    topicPublicId: string,
    patch: Parameters<GuidedRetrospectiveTopicRepository["updateTitleAndSort"]>[3],
  ) {
    const t = await this.findByPublicId(ws, proj, topicPublicId)
    if (!t) return null
    const next = { ...t, ...patch }
    this.topics.set(topicPublicId, next)
    return next
  }

  async updateVoteAggregates(ws: string, proj: string, topicPublicId: string, patch) {
    const t = await this.findByPublicId(ws, proj, topicPublicId)
    if (!t) return
    this.topics.set(topicPublicId, { ...t, ...patch })
  }

  async deleteTopic(ws: string, proj: string, sessionPublicId: string, topicPublicId: string) {
    const t = this.topics.get(topicPublicId)
    if (
      t &&
      t.workspacePublicId === ws &&
      t.projectPublicId === proj &&
      t.sessionPublicId === sessionPublicId
    ) {
      this.topics.delete(topicPublicId)
    }
  }
}

export class MemGuidedRetrospectiveContributions implements GuidedRetrospectiveContributionRepository {
  rows = new Map<string, GuidedRetrospectiveContributionState>()

  async listBySession(ws: string, proj: string, sessionPublicId: string) {
    return [...this.rows.values()]
      .filter((r) => r.workspacePublicId === ws && r.projectPublicId === proj && r.sessionPublicId === sessionPublicId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async findByPublicId(ws: string, proj: string, contributionPublicId: string) {
    const r = this.rows.get(contributionPublicId) ?? null
    if (!r || r.workspacePublicId !== ws || r.projectPublicId !== proj) return null
    return r
  }

  async insert(row: GuidedRetrospectiveContributionState): Promise<void> {
    this.rows.set(row.contributionPublicId, { ...row })
  }

  async updateTopicAssignment(
    ws: string,
    proj: string,
    contributionPublicId: string,
    patch: Parameters<GuidedRetrospectiveContributionRepository["updateTopicAssignment"]>[3],
  ) {
    const r = await this.findByPublicId(ws, proj, contributionPublicId)
    if (!r) return null
    const next = { ...r, ...patch }
    this.rows.set(contributionPublicId, next)
    return next
  }

  async countBySession(ws: string, proj: string, sessionPublicId: string) {
    return [...this.rows.values()].filter(
      (r) => r.workspacePublicId === ws && r.projectPublicId === proj && r.sessionPublicId === sessionPublicId,
    ).length
  }
}

export class MemGuidedRetrospectiveVotes implements GuidedRetrospectiveVoteRepository {
  votes = new Map<string, GuidedRetrospectiveVoteState>()

  private vk(v: GuidedRetrospectiveVoteState) {
    return `${v.workspacePublicId}|${v.projectPublicId}|${v.sessionPublicId}|${v.userPublicId}|${v.topicPublicId}`
  }

  async listBySession(ws: string, proj: string, sessionPublicId: string) {
    return [...this.votes.values()].filter(
      (v) => v.workspacePublicId === ws && v.projectPublicId === proj && v.sessionPublicId === sessionPublicId,
    )
  }

  async listBySessionAndUser(ws: string, proj: string, sessionPublicId: string, userPublicId: string) {
    return [...this.votes.values()].filter(
      (v) =>
        v.workspacePublicId === ws &&
        v.projectPublicId === proj &&
        v.sessionPublicId === sessionPublicId &&
        v.userPublicId === userPublicId,
    )
  }

  async findUserVoteOnTopic(ws: string, proj: string, sessionPublicId: string, userPublicId: string, topicPublicId: string) {
    return (
      [...this.votes.values()].find(
        (v) =>
          v.workspacePublicId === ws &&
          v.projectPublicId === proj &&
          v.sessionPublicId === sessionPublicId &&
          v.userPublicId === userPublicId &&
          v.topicPublicId === topicPublicId,
      ) ?? null
    )
  }

  async listBySessionAndTopic(ws: string, proj: string, sessionPublicId: string, topicPublicId: string) {
    return [...this.votes.values()].filter(
      (v) =>
        v.workspacePublicId === ws &&
        v.projectPublicId === proj &&
        v.sessionPublicId === sessionPublicId &&
        v.topicPublicId === topicPublicId,
    )
  }

  async upsertVote(row: GuidedRetrospectiveVoteState): Promise<void> {
    const k = this.vk(row)
    const existing = [...this.votes.entries()].find(([, v]) => this.vk(v) === k)
    if (existing) {
      this.votes.delete(existing[0])
    }
    this.votes.set(row.votePublicId, { ...row })
  }

  async deleteVote(ws: string, proj: string, sessionPublicId: string, userPublicId: string, topicPublicId: string) {
    const hit = [...this.votes.entries()].find(
      ([, v]) =>
        v.workspacePublicId === ws &&
        v.projectPublicId === proj &&
        v.sessionPublicId === sessionPublicId &&
        v.userPublicId === userPublicId &&
        v.topicPublicId === topicPublicId,
    )
    if (hit) this.votes.delete(hit[0])
  }

  async deleteVotesForTopic(ws: string, proj: string, sessionPublicId: string, topicPublicId: string) {
    for (const [id, v] of [...this.votes.entries()]) {
      if (
        v.workspacePublicId === ws &&
        v.projectPublicId === proj &&
        v.sessionPublicId === sessionPublicId &&
        v.topicPublicId === topicPublicId
      ) {
        this.votes.delete(id)
      }
    }
  }

  async aggregateForSession(ws: string, proj: string, sessionPublicId: string) {
    const vs = await this.listBySession(ws, proj, sessionPublicId)
    return {
      voteRecordCount: vs.length,
      sessionVoteStickerTotal: vs.reduce((a, v) => a + v.stickerWeight, 0),
    }
  }
}

export class MemGuidedRetrospectiveActionItems implements GuidedRetrospectiveActionItemRepository {
  rows = new Map<string, GuidedRetrospectiveActionItemState[]>()

  private key(ws: string, proj: string, sessionPublicId: string) {
    return `${ws}|${proj}|${sessionPublicId}`
  }

  private cloneItem(r: GuidedRetrospectiveActionItemState): GuidedRetrospectiveActionItemState {
    return {
      ...r,
      sourceContributionIds: [...r.sourceContributionIds],
      sourceTopicPublicIds: [...r.sourceTopicPublicIds],
      history: r.history.map((h) => ({ ...h, occurredAt: new Date(h.occurredAt) })),
    }
  }

  async listBySession(ws: string, proj: string, sessionPublicId: string) {
    return [...(this.rows.get(this.key(ws, proj, sessionPublicId)) ?? [])].map((x) => this.cloneItem(x))
  }

  async replaceAllForSession(ws: string, proj: string, sessionPublicId: string, newRows: GuidedRetrospectiveActionItemState[]) {
    this.rows.set(
      this.key(ws, proj, sessionPublicId),
      newRows.map((r) => this.cloneItem({ ...r, history: r.history ?? [] })),
    )
  }

  async listByProject(ws: string, proj: string) {
    const out: GuidedRetrospectiveActionItemState[] = []
    for (const [, list] of this.rows) {
      for (const r of list) {
        if (r.workspacePublicId === ws && r.projectPublicId === proj) {
          out.push(this.cloneItem(r))
        }
      }
    }
    out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return out
  }

  async findByPublicId(ws: string, proj: string, actionItemPublicId: string) {
    for (const [, list] of this.rows) {
      const hit = list.find((r) => r.workspacePublicId === ws && r.projectPublicId === proj && r.actionItemPublicId === actionItemPublicId)
      if (hit) return this.cloneItem(hit)
    }
    return null
  }

  async applyPatchWithHistory(
    ws: string,
    proj: string,
    actionItemPublicId: string,
    fields: Parameters<GuidedRetrospectiveActionItemRepository["applyPatchWithHistory"]>[3],
    newHistory: Parameters<GuidedRetrospectiveActionItemRepository["applyPatchWithHistory"]>[4],
    updatedAt: Date,
  ) {
    for (const [k, list] of this.rows) {
      const idx = list.findIndex((r) => r.workspacePublicId === ws && r.projectPublicId === proj && r.actionItemPublicId === actionItemPublicId)
      if (idx < 0) continue
      const prev = list[idx]!
      const next: GuidedRetrospectiveActionItemState = {
        ...prev,
        ...fields,
        history: [...prev.history, ...newHistory.map((h) => ({ ...h, occurredAt: new Date(h.occurredAt) }))],
        updatedAt,
      }
      const nextList = [...list]
      nextList[idx] = next
      this.rows.set(k, nextList)
      return this.cloneItem(next)
    }
    return null
  }
}
