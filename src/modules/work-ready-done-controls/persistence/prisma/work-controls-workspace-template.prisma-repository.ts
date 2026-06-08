import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkControlsTemplateState } from "../../domain/work-ready-done-controls.dto.js"
import type { WorkControlsWorkspaceTemplateRepository } from "../work-controls-workspace-template.repository.js"
import { docToTemplate } from "../work-controls.persistence-mapper.js"

export class WorkControlsWorkspaceTemplatePrismaRepository implements WorkControlsWorkspaceTemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOne(workspacePublicId: string): Promise<WorkControlsTemplateState | null> {
    const row = await this.prisma.workControlsWorkspaceTemplate.findUnique({
      where: { workspace_public_id: workspacePublicId },
    })
    if (!row) return null
    return docToTemplate({
      workspacePublicId: row.workspace_public_id,
      version: row.version,
      criteria: row.criteria as WorkControlsTemplateState["criteria"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  async upsert(state: WorkControlsTemplateState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error("work_controls_template_upsert_context_not_found")
    const criteria = state.criteria as unknown as Prisma.InputJsonValue
    await this.prisma.workControlsWorkspaceTemplate.upsert({
      where: { workspace_id: workspaceId },
      create: {
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        version: state.version,
        criteria,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      update: {
        version: state.version,
        criteria,
        updated_at: state.updatedAt,
      },
    })
  }
}
