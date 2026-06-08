import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import type { ProjectDraftState } from "../../domain/project-draft.js"
import { docToState, stateToDocProps } from "../mappers/project-draft.mapper.js"
import type { ProjectDraftRepository } from "../project-draft.repository.js"
import type { ProjectDraftDocProps } from "../schemas/project-draft.schema.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ProjectDraft } from "@prisma/client"

function rowToDocProps(row: ProjectDraft): ProjectDraftDocProps {
  return {
    draftPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    createdByUserPublicId: row.created_by_user_public_id,
    status: row.status,
    projectName: row.project_name,
    charter: row.charter as ProjectDraftDocProps["charter"],
    methodologyAssessment: row.methodology_assessment as ProjectDraftDocProps["methodologyAssessment"],
    recommendationResult: row.recommendation_result as unknown as ProjectDraftDocProps["recommendationResult"],
    selectedApproach: row.selected_approach as ProjectDraftDocProps["selectedApproach"],
    wasRecommendationOverridden: row.was_recommendation_overridden,
    overrideJustification: row.override_justification,
    materializedProjectPublicId: row.materialized_project_public_id,
    trace: row.trace as unknown as ProjectDraftDocProps["trace"],
    materialization: row.materialization as unknown as ProjectDraftDocProps["materialization"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stateToPrismaCreate(
  state: ProjectDraftState,
  workspaceId: string,
): Prisma.ProjectDraftUncheckedCreateInput {
  const doc = stateToDocProps(state)
  return {
    public_id: doc.draftPublicId,
    workspace_id: workspaceId,
    workspace_public_id: doc.workspacePublicId,
    created_by_user_public_id: doc.createdByUserPublicId,
    status: doc.status,
    project_name: doc.projectName,
    charter: doc.charter as Prisma.InputJsonValue,
    methodology_assessment: doc.methodologyAssessment as Prisma.InputJsonValue,
    recommendation_result: doc.recommendationResult
      ? (doc.recommendationResult as Prisma.InputJsonValue)
      : undefined,
    selected_approach: doc.selectedApproach,
    was_recommendation_overridden: doc.wasRecommendationOverridden,
    override_justification: doc.overrideJustification,
    materialized_project_public_id: doc.materializedProjectPublicId,
    trace: doc.trace as Prisma.InputJsonValue,
    materialization: doc.materialization as Prisma.InputJsonValue,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  }
}

/** PostgreSQL para `project_drafts`. en runtime. */
export class ProjectDraftPrismaRepository implements ProjectDraftRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: ProjectDraftState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.projectDraft.create({ data: stateToPrismaCreate(state, workspaceId) })
  }

  async replace(state: ProjectDraftState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    const res = await this.prisma.projectDraft.updateMany({
      where: { workspace_id: workspaceId, public_id: state.draftPublicId },
      data: stateToPrismaCreate(state, workspaceId),
    })
    if (res.count === 0) throw new Error("project_draft_not_found")
  }

  async findByWorkspaceAndDraftPublicId(
    workspacePublicId: string,
    draftPublicId: string,
    _session?: ClientSession,
  ): Promise<ProjectDraftState | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return null
    const row = await this.prisma.projectDraft.findFirst({
      where: { workspace_id: workspaceId, public_id: draftPublicId },
    })
    return row ? docToState(rowToDocProps(row)) : null
  }

  async listByWorkspacePublicId(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<ProjectDraftState[]> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return []
    const rows = await this.prisma.projectDraft.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { updated_at: "desc" },
    })
    return rows.map((r) => docToState(rowToDocProps(r)))
  }

  async deleteByWorkspaceAndDraftPublicId(
    workspacePublicId: string,
    draftPublicId: string,
    _session?: ClientSession,
  ): Promise<boolean> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    if (!workspaceId) return false
    const res = await this.prisma.projectDraft.deleteMany({
      where: { workspace_id: workspaceId, public_id: draftPublicId },
    })
    return res.count === 1
  }
}
