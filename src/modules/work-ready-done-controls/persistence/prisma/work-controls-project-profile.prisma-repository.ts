import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkControlsProjectProfileState } from "../../domain/work-ready-done-controls.dto.js"
import type { WorkControlsProjectProfileRepository } from "../work-controls-project-profile.repository.js"
import { docToProfile } from "../work-controls.persistence-mapper.js"

export class WorkControlsProjectProfilePrismaRepository implements WorkControlsProjectProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOne(
    workspacePublicId: string,
    projectPublicId: string,
    approach: "scrum" | "kanban",
  ): Promise<WorkControlsProjectProfileState | null> {
    const row = await this.prisma.workControlsProjectProfile.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        approach,
      },
    })
    if (!row) return null
    return docToProfile({
      workspacePublicId: row.workspace_public_id,
      projectPublicId: row.project_public_id,
      approach: row.approach as "scrum" | "kanban",
      version: row.version,
      definitionSource: row.definition_source as WorkControlsProjectProfileState["definitionSource"],
      criteria: row.criteria as WorkControlsProjectProfileState["criteria"],
      kanbanColumnMapping: {
        startExecutionColumnPublicId: row.kanban_start_execution_column_public_id,
        doneCloseItemColumnPublicId: row.kanban_done_close_item_column_public_id,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  async upsert(state: WorkControlsProjectProfileState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!workspaceId || !projectId) throw new Error("work_controls_profile_upsert_context_not_found")
    const criteria = state.criteria as unknown as Prisma.InputJsonValue
    await this.prisma.workControlsProjectProfile.upsert({
      where: {
        workspace_id_project_id_approach: {
          workspace_id: workspaceId,
          project_id: projectId,
          approach: state.approach,
        },
      },
      create: {
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        approach: state.approach,
        version: state.version,
        definition_source: state.definitionSource,
        criteria,
        kanban_start_execution_column_public_id:
          state.kanbanColumnMapping.startExecutionColumnPublicId,
        kanban_done_close_item_column_public_id:
          state.kanbanColumnMapping.doneCloseItemColumnPublicId,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        version: state.version,
        definition_source: state.definitionSource,
        criteria,
        kanban_start_execution_column_public_id:
          state.kanbanColumnMapping.startExecutionColumnPublicId,
        kanban_done_close_item_column_public_id:
          state.kanbanColumnMapping.doneCloseItemColumnPublicId,
        updated_at: state.updatedAt,
      },
    })
  }
}
