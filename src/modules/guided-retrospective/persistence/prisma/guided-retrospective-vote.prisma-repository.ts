import type { PrismaClient } from "@prisma/client"
import {
  resolveGuidedRetrospectiveSessionId,
  resolveGuidedRetrospectiveTopicId,
} from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedRetrospectiveVoteState } from "../../domain/guided-retrospective-vote.js"
import type { GuidedRetrospectiveVoteRepository } from "../guided-retrospective-vote.repository.js"
import type { GuidedRetrospectiveVote } from "@prisma/client"

function rowToState(row: GuidedRetrospectiveVote): GuidedRetrospectiveVoteState {
  return {
    votePublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    topicPublicId: row.topic_public_id,
    userPublicId: row.user_public_id,
    stickerWeight: row.sticker_weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_retrospective_votes`. */
export class GuidedRetrospectiveVotePrismaRepository implements GuidedRetrospectiveVoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]> {
    const rows = await this.prisma.guidedRetrospectiveVote.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
    })
    return rows.map(rowToState)
  }

  async listBySessionAndUser(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]> {
    const rows = await this.prisma.guidedRetrospectiveVote.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        user_public_id: userPublicId,
      },
    })
    return rows.map(rowToState)
  }

  async findUserVoteOnTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState | null> {
    const row = await this.prisma.guidedRetrospectiveVote.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        user_public_id: userPublicId,
        topic_public_id: topicPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async upsertVote(row: GuidedRetrospectiveVoteState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, row.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      row.workspacePublicId,
      row.projectPublicId,
    )
    const sessionId = await resolveGuidedRetrospectiveSessionId(
      this.prisma,
      row.workspacePublicId,
      row.projectPublicId,
      row.sessionPublicId,
    )
    const topicId = await resolveGuidedRetrospectiveTopicId(
      this.prisma,
      row.workspacePublicId,
      row.projectPublicId,
      row.sessionPublicId,
      row.topicPublicId,
    )
    if (!workspaceId || !projectId || !sessionId || !topicId) {
      throw new Error("guided_retrospective_vote_upsert_context_not_found")
    }

    await this.prisma.guidedRetrospectiveVote.upsert({
      where: {
        workspace_id_project_id_session_id_user_public_id_topic_id: {
          workspace_id: workspaceId,
          project_id: projectId,
          session_id: sessionId,
          user_public_id: row.userPublicId,
          topic_id: topicId,
        },
      },
      create: {
        public_id: row.votePublicId,
        session_id: sessionId,
        session_public_id: row.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: row.workspacePublicId,
        project_id: projectId,
        project_public_id: row.projectPublicId,
        topic_id: topicId,
        topic_public_id: row.topicPublicId,
        user_public_id: row.userPublicId,
        sticker_weight: row.stickerWeight,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      },
      update: {
        public_id: row.votePublicId,
        sticker_weight: row.stickerWeight,
        updated_at: row.updatedAt,
      },
    })
  }

  async deleteVote(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    userPublicId: string,
    topicPublicId: string,
  ): Promise<void> {
    await this.prisma.guidedRetrospectiveVote.deleteMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        user_public_id: userPublicId,
        topic_public_id: topicPublicId,
      },
    })
  }

  async deleteVotesForTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<void> {
    await this.prisma.guidedRetrospectiveVote.deleteMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        topic_public_id: topicPublicId,
      },
    })
  }

  async listBySessionAndTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveVoteState[]> {
    const rows = await this.prisma.guidedRetrospectiveVote.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        topic_public_id: topicPublicId,
      },
    })
    return rows.map(rowToState)
  }

  async aggregateForSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<{ voteRecordCount: number; sessionVoteStickerTotal: number }> {
    const agg = await this.prisma.guidedRetrospectiveVote.aggregate({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      _count: { _all: true },
      _sum: { sticker_weight: true },
    })
    return {
      voteRecordCount: agg._count._all,
      sessionVoteStickerTotal: agg._sum.sticker_weight ?? 0,
    }
  }
}
