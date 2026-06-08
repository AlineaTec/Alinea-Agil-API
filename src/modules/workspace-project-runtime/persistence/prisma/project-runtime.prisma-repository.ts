import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceRuntimeProjectState } from "../../domain/workspace-runtime-project.js"
import { docToWorkspaceRuntimeProjectState } from "../mappers/project-runtime.mapper.js"
import type { ProjectRuntimeRepository } from "../project-runtime.repository.js"
import type { WorkspaceRuntimeProjectDocProps } from "../schemas/workspace-runtime-project.schema.js"
import type { Project } from "@prisma/client"

function rowToDoc(row: Project): WorkspaceRuntimeProjectDocProps {
  return {
    projectPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    sourceDraftPublicId: row.source_draft_public_id,
    projectName: row.project_name,
    operationalApproach: row.operational_approach,
    initialConfigurationSummary: row.initial_configuration_summary as Record<string, unknown>,
    status: row.lifecycle_status,
    materializedAt: row.materialized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL para `projects`. */
export class ProjectRuntimePrismaRepository implements ProjectRuntimeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: WorkspaceRuntimeProjectState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.project.create({
      data: {
        public_id: state.projectPublicId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        source_draft_public_id: state.sourceDraftPublicId,
        project_name: state.projectName,
        operational_approach: state.operationalApproach,
        initial_configuration_summary: state.initialConfigurationSummary as Prisma.InputJsonValue,
        lifecycle_status: state.status,
        materialized_at: state.materializedAt,
      },
    })
  }

  async findByWorkspaceAndProjectPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState | null> {
    const row = await this.prisma.project.findFirst({
      where: { workspace_public_id: workspacePublicId, public_id: projectPublicId },
    })
    return row ? docToWorkspaceRuntimeProjectState(rowToDoc(row)) : null
  }

  async findByWorkspaceAndSourceDraftPublicId(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState | null> {
    const row = await this.prisma.project.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        source_draft_public_id: sourceDraftPublicId,
      },
    })
    return row ? docToWorkspaceRuntimeProjectState(rowToDoc(row)) : null
  }

  async listByWorkspacePublicId(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceRuntimeProjectState[]> {
    const rows = await this.prisma.project.findMany({
      where: { workspace_public_id: workspacePublicId },
      orderBy: { updated_at: "desc" },
    })
    return rows.map((r) => docToWorkspaceRuntimeProjectState(rowToDoc(r)))
  }

  async updateProjectNameByWorkspaceAndSourceDraft(
    workspacePublicId: string,
    sourceDraftPublicId: string,
    projectName: string,
    _session?: ClientSession,
  ): Promise<void> {
    await this.prisma.project.updateMany({
      where: { workspace_public_id: workspacePublicId, source_draft_public_id: sourceDraftPublicId },
      data: { project_name: projectName },
    })
  }
}
