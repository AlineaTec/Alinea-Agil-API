import type { PrismaClient } from "@prisma/client"
import {
  normalizeWorkspaceModality,
  type WorkspaceModality,
} from "../../../registro-onboarding/domain/workspace-modality.js"
import type { WorkspaceBasicSettingsReadModel } from "../../domain/workspace-basic-settings.read-model.js"
import type { WorkspaceSettingsRepository } from "../workspace-settings-read.repository.js"

function rowToReadModel(row: {
  public_id: string
  slug: string
  display_name: string
  modality: string
  created_at: Date
  updated_at: Date
}): WorkspaceBasicSettingsReadModel {
  const modality: WorkspaceModality =
    normalizeWorkspaceModality(row.modality) ?? "individual"
  return {
    workspacePublicId: row.public_id,
    workspaceDisplayName: row.display_name,
    workspaceCode: row.slug,
    modality,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

const settingsSelect = {
  public_id: true,
  slug: true,
  display_name: true,
  modality: true,
  created_at: true,
  updated_at: true,
} as const

/**
 * Proyección de settings básicos sobre tabla `workspaces` (misma fuente que `WORKSPACE_PERSISTENCE_DRIVER`).
 * Proyección sobre fila `workspaces` (antes `workspace_records` en el sistema legacy).
 */
export class WorkspaceSettingsPrismaRepository implements WorkspaceSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBasicSettingsByWorkspacePublicId(
    workspacePublicId: string,
  ): Promise<WorkspaceBasicSettingsReadModel | null> {
    const row = await this.prisma.workspace.findUnique({
      where: { public_id: workspacePublicId },
      select: settingsSelect,
    })
    return row ? rowToReadModel(row) : null
  }

  async updateDisplayNameByWorkspacePublicId(
    workspacePublicId: string,
    displayName: string,
  ): Promise<WorkspaceBasicSettingsReadModel | null> {
    try {
      const row = await this.prisma.workspace.update({
        where: { public_id: workspacePublicId },
        data: { display_name: displayName },
        select: settingsSelect,
      })
      return rowToReadModel(row)
    } catch {
      return null
    }
  }
}
