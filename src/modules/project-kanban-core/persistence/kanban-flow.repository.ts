import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import type { ProjectKanbanFlowConfigState } from "../domain/kanban-flow.js"

export type KanbanFlowRepository = {
  insert(state: ProjectKanbanFlowConfigState, session?: ClientSession): Promise<void>
  /**
   * Reemplaza columnas, umbrales y entrada; el caller debe ajustar `createdAt`/`updatedAt` en `state` si aplica.
   */
  replace(state: ProjectKanbanFlowConfigState, session?: ClientSession): Promise<void>
  findByProject(
    workspacePublicId: string,
    projectPublicId: string,
    session?: ClientSession,
  ): Promise<ProjectKanbanFlowConfigState | null>
}
