import type { PrismaClient } from "@prisma/client"
import {
  resolveGuidedRetrospectiveSessionId,
  resolveGuidedRetrospectiveTopicId,
} from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { GuidedRetrospectiveContributionState } from "../../domain/guided-retrospective-contribution.js"
import type { GuidedRetrospectiveContributionRepository } from "../guided-retrospective-contribution.repository.js"
import type { GuidedRetrospectiveContribution } from "@prisma/client"

function rowToState(row: GuidedRetrospectiveContribution): GuidedRetrospectiveContributionState {
  return {
    contributionPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    authorUserPublicId: row.author_user_public_id,
    authorGuestLabel: row.author_guest_label ?? null,
    visibilityMode: row.visibility_mode as GuidedRetrospectiveContributionState["visibilityMode"],
    templateColumnKey: row.template_column_key,
    content: row.content,
    topicPublicId: row.topic_public_id,
    topicStatus: row.topic_status as GuidedRetrospectiveContributionState["topicStatus"],
    voteCount: row.vote_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_retrospective_contributions`. */
export class GuidedRetrospectiveContributionPrismaRepository
  implements GuidedRetrospectiveContributionRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveContributionState[]> {
    const rows = await this.prisma.guidedRetrospectiveContribution.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { created_at: "asc" },
    })
    return rows.map(rowToState)
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    contributionPublicId: string,
  ): Promise<GuidedRetrospectiveContributionState | null> {
    const row = await this.prisma.guidedRetrospectiveContribution.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: contributionPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async insert(row: GuidedRetrospectiveContributionState): Promise<void> {
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
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("guided_retrospective_contribution_insert_context_not_found")
    }

    const topicId = row.topicPublicId
      ? await resolveGuidedRetrospectiveTopicId(
          this.prisma,
          row.workspacePublicId,
          row.projectPublicId,
          row.sessionPublicId,
          row.topicPublicId,
        )
      : null

    await this.prisma.guidedRetrospectiveContribution.create({
      data: {
        public_id: row.contributionPublicId,
        session_id: sessionId,
        session_public_id: row.sessionPublicId,
        workspace_id: workspaceId,
        workspace_public_id: row.workspacePublicId,
        project_id: projectId,
        project_public_id: row.projectPublicId,
        author_user_public_id: row.authorUserPublicId,
        author_guest_label: row.authorGuestLabel,
        visibility_mode: row.visibilityMode,
        template_column_key: row.templateColumnKey,
        content: row.content,
        topic_id: topicId,
        topic_public_id: row.topicPublicId,
        topic_status: row.topicStatus,
        vote_count: row.voteCount,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      },
    })
  }

  async updateTopicAssignment(
    workspacePublicId: string,
    projectPublicId: string,
    contributionPublicId: string,
    patch: Parameters<GuidedRetrospectiveContributionRepository["updateTopicAssignment"]>[3],
  ): Promise<GuidedRetrospectiveContributionState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, contributionPublicId)
    if (!existing) return null

    const topicId = patch.topicPublicId
      ? await resolveGuidedRetrospectiveTopicId(
          this.prisma,
          workspacePublicId,
          projectPublicId,
          existing.sessionPublicId,
          patch.topicPublicId,
        )
      : null

    const res = await this.prisma.guidedRetrospectiveContribution.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: contributionPublicId,
      },
      data: {
        topic_public_id: patch.topicPublicId,
        topic_id: topicId,
        topic_status: patch.topicStatus,
        updated_at: patch.updatedAt,
      },
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, contributionPublicId)
  }

  async countBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<number> {
    return this.prisma.guidedRetrospectiveContribution.count({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
    })
  }
}
