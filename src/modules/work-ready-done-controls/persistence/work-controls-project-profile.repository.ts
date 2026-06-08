import type { WorkControlsProjectProfileState } from "../domain/work-ready-done-controls.dto.js"

export type WorkControlsProjectProfileRepository = {
  findOne(
    workspacePublicId: string,
    projectPublicId: string,
    approach: "scrum" | "kanban",
  ): Promise<WorkControlsProjectProfileState | null>
  upsert(state: WorkControlsProjectProfileState): Promise<void>
}
