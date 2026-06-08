import { Prisma, type PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  GuidedRetrospectiveAdditiveNote,
  GuidedRetrospectiveSessionState,
  GuidedRetrospectiveTranscriptAfterClose,
  RetrospectivePeriodWindow,
} from "../../domain/guided-retrospective-session.js"
import type { GuidedRetrospectiveSessionRepository } from "../guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveSession } from "@prisma/client"

const OPEN_STATUSES: GuidedRetrospectiveSessionState["status"][] = [
  "planned",
  "open",
  "collecting",
  "voting",
  "closing",
]

const CLOSED_STATUSES: GuidedRetrospectiveSessionState["status"][] = [
  "closed",
  "closed_without_actions",
]

type AdditiveNoteJson = {
  noteText: string
  createdByUserPublicId: string
  createdAt: string | Date
}

function parseAdditiveNotes(raw: unknown): GuidedRetrospectiveAdditiveNote[] {
  if (!Array.isArray(raw)) return []
  return raw.map((n) => {
    const note = n as AdditiveNoteJson
    return {
      noteText: note.noteText,
      createdByUserPublicId: note.createdByUserPublicId,
      createdAt: note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt),
    }
  })
}

function parseTranscript(raw: unknown): GuidedRetrospectiveTranscriptAfterClose | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as { text: string; updatedAt: string | Date; updatedByUserPublicId: string }
  return {
    text: t.text,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt : new Date(t.updatedAt),
    updatedByUserPublicId: t.updatedByUserPublicId,
  }
}

function parseRetrospectivePeriod(raw: unknown): RetrospectivePeriodWindow | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as { periodStartYmd: string; periodEndYmd: string }
  return { periodStartYmd: p.periodStartYmd, periodEndYmd: p.periodEndYmd }
}

function rowToState(row: GuidedRetrospectiveSession): GuidedRetrospectiveSessionState {
  return {
    sessionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    sessionDate: row.session_date,
    sessionSlot: row.session_slot,
    sprintPublicId: row.sprint_public_id,
    retrospectivePeriod: parseRetrospectivePeriod(row.retrospective_period),
    operationalApproach: row.operational_approach as GuidedRetrospectiveSessionState["operationalApproach"],
    operationalTimeZone: row.operational_time_zone,
    retrospectiveMode: row.retrospective_mode as GuidedRetrospectiveSessionState["retrospectiveMode"],
    facilitatorUserPublicId: row.facilitator_user_public_id,
    status: row.status as GuidedRetrospectiveSessionState["status"],
    templateKey: row.template_key,
    sessionCode: row.session_code,
    votesPerParticipant: row.votes_per_participant,
    allowMultipleVotesPerTopic: row.allow_multiple_votes_per_topic,
    defaultContributionVisibility:
      row.default_contribution_visibility as GuidedRetrospectiveSessionState["defaultContributionVisibility"],
    goalSummary: row.goal_summary,
    summary: row.summary,
    agreements: [...row.agreements],
    participantUserPublicIds: [...row.participant_user_public_ids],
    participantWithContributionUserPublicIds: [...row.participant_with_contribution_user_public_ids],
    participantCount: row.participant_count,
    participantWithContributionCount: row.participant_with_contribution_count,
    contributionCount: row.contribution_count,
    topicCount: row.topic_count,
    voteRecordCount: row.vote_record_count,
    sessionVoteStickerTotal: row.session_vote_sticker_total,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    transcriptAfterClose: parseTranscript(row.transcript_after_close),
    additiveNotesAfterClose: parseAdditiveNotes(row.additive_notes_after_close),
    contextHints: row.context_hints as Record<string, string> | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stateToCreate(
  state: GuidedRetrospectiveSessionState,
  ids: { workspaceId: string; projectId: string; sprintId: string | null },
) {
  return {
    public_id: state.sessionPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: state.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: state.projectPublicId,
    session_date: state.sessionDate,
    session_slot: state.sessionSlot,
    sprint_id: ids.sprintId,
    sprint_public_id: state.sprintPublicId,
    retrospective_period: state.retrospectivePeriod
      ? (state.retrospectivePeriod as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    operational_approach: state.operationalApproach,
    operational_time_zone: state.operationalTimeZone,
    retrospective_mode: state.retrospectiveMode,
    facilitator_user_public_id: state.facilitatorUserPublicId,
    status: state.status,
    template_key: state.templateKey,
    session_code: state.sessionCode,
    votes_per_participant: state.votesPerParticipant,
    allow_multiple_votes_per_topic: state.allowMultipleVotesPerTopic,
    default_contribution_visibility: state.defaultContributionVisibility,
    goal_summary: state.goalSummary,
    summary: state.summary,
    agreements: state.agreements,
    participant_user_public_ids: state.participantUserPublicIds,
    participant_with_contribution_user_public_ids: state.participantWithContributionUserPublicIds,
    participant_count: state.participantCount,
    participant_with_contribution_count: state.participantWithContributionCount,
    contribution_count: state.contributionCount,
    topic_count: state.topicCount,
    vote_record_count: state.voteRecordCount,
    session_vote_sticker_total: state.sessionVoteStickerTotal,
    started_at: state.startedAt,
    closed_at: state.closedAt,
    transcript_after_close: state.transcriptAfterClose
      ? (state.transcriptAfterClose as Prisma.InputJsonValue)
      : undefined,
    additive_notes_after_close: state.additiveNotesAfterClose as Prisma.InputJsonValue,
    context_hints: state.contextHints
      ? (state.contextHints as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }
}

/** PostgreSQL: `guided_retrospective_sessions`. */
export class GuidedRetrospectiveSessionPrismaRepository implements GuidedRetrospectiveSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveIds(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string | null,
  ): Promise<{ workspaceId: string; projectId: string; sprintId: string | null } | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    if (!workspaceId || !projectId) return null
    const sprintId = sprintPublicId
      ? await resolveSprintId(this.prisma, workspacePublicId, projectPublicId, sprintPublicId)
      : null
    if (sprintPublicId && !sprintId) return null
    return { workspaceId, projectId, sprintId }
  }

  async findByKey(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDate: string,
    sessionSlot: string,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const row = await this.prisma.guidedRetrospectiveSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: sessionDate,
        session_slot: sessionSlot,
      },
    })
    return row ? rowToState(row) : null
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const row = await this.prisma.guidedRetrospectiveSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async findOpenBySessionCodeInWorkspace(
    workspacePublicId: string,
    sessionCode: string,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const row = await this.prisma.guidedRetrospectiveSession.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        session_code: sessionCode,
        status: { in: OPEN_STATUSES },
      },
    })
    return row ? rowToState(row) : null
  }

  async findOpenBySessionCodeGlobally(
    sessionCode: string,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const row = await this.prisma.guidedRetrospectiveSession.findFirst({
      where: { session_code: sessionCode, status: { in: OPEN_STATUSES } },
      orderBy: { updated_at: "desc" },
    })
    return row ? rowToState(row) : null
  }

  async insert(state: GuidedRetrospectiveSessionState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId, state.sprintPublicId)
    if (!ids) throw new Error("guided_retrospective_session_insert_context_not_found")
    await this.prisma.guidedRetrospectiveSession.create({
      data: stateToCreate(state, ids),
    })
  }

  async updateHeaderWhenWritable(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRetrospectiveSessionRepository["updateHeaderWhenWritable"]>[3],
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const data: Prisma.GuidedRetrospectiveSessionUncheckedUpdateManyInput = {
      updated_at: patch.updatedAt,
    }

    if (patch.retrospectiveMode !== undefined) data.retrospective_mode = patch.retrospectiveMode
    if (patch.facilitatorUserPublicId !== undefined) {
      data.facilitator_user_public_id = patch.facilitatorUserPublicId
    }
    if (patch.templateKey !== undefined) data.template_key = patch.templateKey
    if (patch.votesPerParticipant !== undefined) data.votes_per_participant = patch.votesPerParticipant
    if (patch.allowMultipleVotesPerTopic !== undefined) {
      data.allow_multiple_votes_per_topic = patch.allowMultipleVotesPerTopic
    }
    if (patch.defaultContributionVisibility !== undefined) {
      data.default_contribution_visibility = patch.defaultContributionVisibility
    }
    if (patch.goalSummary !== undefined) data.goal_summary = patch.goalSummary
    if (patch.sprintPublicId !== undefined) {
      const sprintId = patch.sprintPublicId
        ? await resolveSprintId(this.prisma, workspacePublicId, projectPublicId, patch.sprintPublicId)
        : null
      if (patch.sprintPublicId && !sprintId) return null
      data.sprint_public_id = patch.sprintPublicId
      data.sprint_id = sprintId
    }
    if (patch.retrospectivePeriod !== undefined) {
      data.retrospective_period = patch.retrospectivePeriod
        ? (patch.retrospectivePeriod as Prisma.InputJsonValue)
        : Prisma.JsonNull
    }
    if (patch.contextHints !== undefined) {
      data.context_hints = patch.contextHints
        ? (patch.contextHints as Prisma.InputJsonValue)
        : Prisma.JsonNull
    }
    if (patch.sessionCode !== undefined) data.session_code = patch.sessionCode
    if (patch.status !== undefined) data.status = patch.status
    if (patch.startedAt !== undefined) data.started_at = patch.startedAt
    if (patch.participantUserPublicIds !== undefined) {
      data.participant_user_public_ids = patch.participantUserPublicIds
    }
    if (patch.participantWithContributionUserPublicIds !== undefined) {
      data.participant_with_contribution_user_public_ids = patch.participantWithContributionUserPublicIds
    }
    if (patch.participantCount !== undefined) data.participant_count = patch.participantCount
    if (patch.participantWithContributionCount !== undefined) {
      data.participant_with_contribution_count = patch.participantWithContributionCount
    }
    if (patch.contributionCount !== undefined) data.contribution_count = patch.contributionCount
    if (patch.topicCount !== undefined) data.topic_count = patch.topicCount
    if (patch.voteRecordCount !== undefined) data.vote_record_count = patch.voteRecordCount
    if (patch.sessionVoteStickerTotal !== undefined) {
      data.session_vote_sticker_total = patch.sessionVoteStickerTotal
    }

    const res = await this.prisma.guidedRetrospectiveSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: OPEN_STATUSES },
      },
      data,
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async updateDenormalizedCounts(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    counts: Parameters<GuidedRetrospectiveSessionRepository["updateDenormalizedCounts"]>[3],
  ): Promise<void> {
    await this.prisma.guidedRetrospectiveSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
      },
      data: {
        contribution_count: counts.contributionCount,
        topic_count: counts.topicCount,
        vote_record_count: counts.voteRecordCount,
        session_vote_sticker_total: counts.sessionVoteStickerTotal,
        participant_count: counts.participantCount,
        participant_with_contribution_count: counts.participantWithContributionCount,
        updated_at: counts.updatedAt,
      },
    })
  }

  async closeSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    patch: Parameters<GuidedRetrospectiveSessionRepository["closeSession"]>[3],
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const res = await this.prisma.guidedRetrospectiveSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: OPEN_STATUSES },
      },
      data: {
        status: patch.status,
        closed_at: patch.closedAt,
        summary: patch.summary,
        agreements: patch.agreements,
        facilitator_user_public_id: patch.facilitatorUserPublicId,
        session_code: patch.sessionCode,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async upsertTranscriptAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    transcript: GuidedRetrospectiveTranscriptAfterClose | null,
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const res = await this.prisma.guidedRetrospectiveSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: CLOSED_STATUSES },
      },
      data: {
        transcript_after_close: transcript
          ? (transcript as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        updated_at: updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async appendAdditiveNoteAfterClose(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    note: GuidedRetrospectiveAdditiveNote,
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveSessionState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
    if (!existing || !CLOSED_STATUSES.includes(existing.status)) return null

    const res = await this.prisma.guidedRetrospectiveSession.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: sessionPublicId,
        status: { in: CLOSED_STATUSES },
      },
      data: {
        additive_notes_after_close: [
          ...existing.additiveNotesAfterClose,
          note,
        ] as Prisma.InputJsonValue,
        updated_at: updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, sessionPublicId)
  }

  async listRecentForProject(
    workspacePublicId: string,
    projectPublicId: string,
    limit: number,
  ): Promise<GuidedRetrospectiveSessionState[]> {
    const rows = await this.prisma.guidedRetrospectiveSession.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: [{ session_date: "desc" }, { session_slot: "desc" }, { updated_at: "desc" }],
      take: limit,
    })
    return rows.map(rowToState)
  }

  async listForProjectSessionDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    sessionDateFromInclusive: string,
    sessionDateToInclusive: string,
  ): Promise<GuidedRetrospectiveSessionState[]> {
    const rows = await this.prisma.guidedRetrospectiveSession.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_date: { gte: sessionDateFromInclusive, lte: sessionDateToInclusive },
      },
      orderBy: [{ session_date: "asc" }, { session_slot: "asc" }, { updated_at: "asc" }],
    })
    return rows.map(rowToState)
  }
}
