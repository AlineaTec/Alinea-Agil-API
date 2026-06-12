import type { Prisma } from "@prisma/client"
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
  listByProjectPage(
    workspacePublicId: string,
    projectPublicId: string,
    options: { skip: number; take: number; assignmentWhere?: Prisma.WorkItemWhereInput },
  ): Promise<ScrumBacklogItemState[]>
  countByProject(
    workspacePublicId: string,
    projectPublicId: string,
    assignmentWhere?: Prisma.WorkItemWhereInput,
  ): Promise<number>
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

  listKanbanBoardItemsByColumn(
    workspacePublicId: string,
    projectPublicId: string,
    columnPublicId: string,
    options: { skip: number; take: number; afterSortOrder?: number; afterPublicId?: string },
  ): Promise<ScrumBacklogItemState[]>

  /** Opciones ligeras para dropdowns (impedimentos, filtros). */
  searchWorkItemOptions(
    workspacePublicId: string,
    projectPublicId: string,
    options: {
      q?: string
      limit: number
      backlogItemPublicIds?: string[]
      kanbanBacklogOnly?: boolean
    },
  ): Promise<
    Array<{
      backlogItemPublicId: string
      itemType: ScrumBacklogItemState["itemType"]
      title: string
      status: ScrumBacklogItemState["status"]
    }>
  >

  /** Proyección ligera para roadmap (sin criterios de aceptación ni comentarios). */
  listRoadmapWorkItems(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<
    Array<{
      backlogItemPublicId: string
      itemType: string
      title: string
      status: string
      sortOrder: number
      priorityLevel: string
      parentItemPublicId: string | null
      createdAt: Date
      updatedAt: Date
      isBlocked: boolean
    }>
  >

  /** Ítems user_story/task no comprometidos en un sprint (planificación). */
  listAvailableSprintCommitItems(
    workspacePublicId: string,
    projectPublicId: string,
    excludeBacklogItemPublicIds: string[],
    options: { q?: string; skip: number; take: number },
  ): Promise<ScrumBacklogItemState[]>

  countAvailableSprintCommitItems(
    workspacePublicId: string,
    projectPublicId: string,
    excludeBacklogItemPublicIds: string[],
    options?: { q?: string },
  ): Promise<number>
}
