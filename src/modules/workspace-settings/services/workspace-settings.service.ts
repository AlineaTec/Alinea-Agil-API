import { evaluateWorkspaceDisplayNameChange } from "../domain/workspace-display-name.policy.js"
import type { WorkspaceBasicSettingsReadModel } from "../domain/workspace-basic-settings.read-model.js"
import type { WorkspaceSettingsRepository } from "../persistence/workspace-settings-read.repository.js"

export type UpdateWorkspaceDisplayNameResult =
  | { ok: true; settings: WorkspaceBasicSettingsReadModel }
  | {
      ok: false
      kind:
        | "invalid_display_name"
        | "no_effective_change"
        | "workspace_not_found"
        | "persist_failed"
      message?: string
    }

export class WorkspaceSettingsService {
  constructor(private readonly repo: WorkspaceSettingsRepository) {}

  getBasicSettings(
    workspacePublicId: string,
  ): Promise<WorkspaceBasicSettingsReadModel | null> {
    return this.repo.findBasicSettingsByWorkspacePublicId(workspacePublicId)
  }

  async updateDisplayName(
    workspacePublicId: string,
    rawDisplayName: string,
  ): Promise<UpdateWorkspaceDisplayNameResult> {
    const current = await this.repo.findBasicSettingsByWorkspacePublicId(workspacePublicId)
    if (!current) {
      return { ok: false, kind: "workspace_not_found" }
    }

    const evaluated = evaluateWorkspaceDisplayNameChange(
      rawDisplayName,
      current.workspaceDisplayName,
    )
    if (!evaluated.ok) {
      return {
        ok: false,
        kind: evaluated.kind,
        message: evaluated.message,
      }
    }

    try {
      const next = await this.repo.updateDisplayNameByWorkspacePublicId(
        workspacePublicId,
        evaluated.normalized,
      )
      if (!next) {
        return { ok: false, kind: "workspace_not_found" }
      }
      return { ok: true, settings: next }
    } catch {
      return {
        ok: false,
        kind: "persist_failed",
        message: "No se pudo guardar el nombre del workspace.",
      }
    }
  }
}
