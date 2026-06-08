import type { WorkControlsTemplateState } from "../domain/work-ready-done-controls.dto.js"

export type WorkControlsWorkspaceTemplateRepository = {
  findOne(workspacePublicId: string): Promise<WorkControlsTemplateState | null>
  upsert(state: WorkControlsTemplateState): Promise<void>
}
