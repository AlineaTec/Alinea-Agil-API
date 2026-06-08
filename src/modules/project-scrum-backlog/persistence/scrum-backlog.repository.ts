import type { WorkItemAssignmentHistoryEvent } from "../../work-item-assignment/domain/work-item-assignment-history-event.js"
import type { ScrumBacklogItemState } from "../domain/scrum-backlog-item.js"

export type ScrumBacklogRepository = {
  insert(state: ScrumBacklogItemState): Promise<void>
  replace(state: ScrumBacklogItemState): Promise<void>
  findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState | null>
  listByProject(workspacePublicId: string, projectPublicId: string): Promise<ScrumBacklogItemState[]>
  maxSortOrderAmongSiblings(
    workspacePublicId: string,
    projectPublicId: string,
    parentItemPublicId: string | null,
  ): Promise<number>
  /** Actualiza `sortOrder` (y `updatedAt`) de varios ítems del mismo proyecto en una sola operación. */
  bulkSetSortOrders(
    workspacePublicId: string,
    projectPublicId: string,
    updates: Array<{ backlogItemPublicId: string; sortOrder: number; updatedAt: Date }>,
  ): Promise<void>
  /**
   * Persiste cambio de asignación y agrega un evento al historial embebido (transacción lógica única).
   */
  pushAssignmentEventAndSetAssignee(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    update: {
      assignedUserPublicId: string | null
      assignmentUpdatedAt: Date
      assignmentUpdatedByUserPublicId: string | null
      event: WorkItemAssignmentHistoryEvent
    },
  ): Promise<ScrumBacklogItemState | null>
  /**
   * Ajusta `commentsCount` (solo comentarios visibles). Para decrementos, exige contador suficiente.
   */
  adjustCommentsCount(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    delta: number,
  ): Promise<boolean>

  /** Kanban backlog plano: `kanbanColumnPublicId` y `parentItemPublicId` null. */
  listKanbanBacklogItems(
    workspacePublicId: string,
    projectPublicId: string,
    options?: { search?: string },
  ): Promise<ScrumBacklogItemState[]>

  countItemsInKanbanColumn(
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
  ): Promise<number>

  maxSortOrderKanbanBacklog(workspacePublicId: string, projectPublicId: string): Promise<number>

  minSortOrderKanbanBacklog(workspacePublicId: string, projectPublicId: string): Promise<number | null>

  /** Ítems con `kanbanColumnPublicId` en flujo (tablero Kanban). */
  listKanbanBoardItems(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ScrumBacklogItemState[]>
}
