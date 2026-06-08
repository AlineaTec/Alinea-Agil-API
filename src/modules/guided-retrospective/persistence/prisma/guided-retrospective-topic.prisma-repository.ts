import type { PrismaClient } from "@prisma/client"
import { resolveGuidedRetrospectiveSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedRetrospectiveTopicState } from "../../domain/guided-retrospective-topic.js"
import type { GuidedRetrospectiveTopicRepository } from "../guided-retrospective-topic.repository.js"
import type { GuidedRetrospectiveTopic } from "@prisma/client"

function rowToState(row: GuidedRetrospectiveTopic): GuidedRetrospectiveTopicState {
  return {
    topicPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    title: row.title,
    sortOrder: row.sort_order,
    voteCount: row.vote_count,
    voteStickerTotal: row.vote_sticker_total,
    createdByUserPublicId: row.created_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_retrospective_topics`. */
export class GuidedRetrospectiveTopicPrismaRepository implements GuidedRetrospectiveTopicRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveTopicState[]> {
    const rows = await this.prisma.guidedRetrospectiveTopic.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    })
    return rows.map(rowToState)
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
  ): Promise<GuidedRetrospectiveTopicState | null> {
    const row = await this.prisma.guidedRetrospectiveTopic.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: topicPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async insert(topic: GuidedRetrospectiveTopicState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, topic.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      topic.workspacePublicId,
      topic.projectPublicId,
    )
    const sessionId = await resolveGuidedRetrospectiveSessionId(
      this.prisma,
      topic.workspacePublicId,
      topic.projectPublicId,
      topic.sessionPublicId,
    )
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("guided_retrospective_topic_insert_context_not_found")
    }

    await this.prisma.guidedRetrospectiveTopic.create({
      data: {
        public_id: topic.topicPublicId,
        session_id: sessionId,
        session_public_id: topic.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: topic.workspacePublicId,
        project_id: projectId,
        project_public_id: topic.projectPublicId,
        title: topic.title,
        sort_order: topic.sortOrder,
        vote_count: topic.voteCount,
        vote_sticker_total: topic.voteStickerTotal,
        created_by_user_public_id: topic.createdByUserPublicId,
        created_at: topic.createdAt,
        updated_at: topic.updatedAt,
      },
    })
  }

  async updateTitleAndSort(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    patch: Parameters<GuidedRetrospectiveTopicRepository["updateTitleAndSort"]>[3],
  ): Promise<GuidedRetrospectiveTopicState | null> {
    const data: { title?: string; sort_order?: number; updated_at: Date } = {
      updated_at: patch.updatedAt,
    }
    if (patch.title !== undefined) data.title = patch.title
    if (patch.sortOrder !== undefined) data.sort_order = patch.sortOrder

    const res = await this.prisma.guidedRetrospectiveTopic.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: topicPublicId,
      },
      data,
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, topicPublicId)
  }

  async updateVoteAggregates(
    workspacePublicId: string,
    projectPublicId: string,
    topicPublicId: string,
    patch: Parameters<GuidedRetrospectiveTopicRepository["updateVoteAggregates"]>[3],
  ): Promise<void> {
    await this.prisma.guidedRetrospectiveTopic.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: topicPublicId,
      },
      data: {
        vote_count: patch.voteCount,
        vote_sticker_total: patch.voteStickerTotal,
        updated_at: patch.updatedAt,
      },
    })
  }

  async deleteTopic(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    topicPublicId: string,
  ): Promise<void> {
    await this.prisma.guidedRetrospectiveTopic.deleteMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
        public_id: topicPublicId,
      },
    })
  }
}
