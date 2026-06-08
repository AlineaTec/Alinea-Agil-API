/**
 * Niveles v1: informativo, advertencia (confirmación al tocar/exceder límite), bloqueo (override restringido).
 */
export type KanbanWipEnforcement = "informational" | "warning" | "blocking"

/**
 * Configuración persistida del flujo Kanban (columnas + entrada al flujo).
 * La columna actual del ítem en flujo será la fuente de verdad operativa (fases posteriores).
 */
export type KanbanColumnState = {
  columnPublicId: string
  name: string
  position: number
  wipLimit: number | null
  policyText: string
  wipEnforcement: KanbanWipEnforcement
}

export type ProjectKanbanFlowConfigState = {
  workspacePublicId: string
  projectPublicId: string
  entryColumnPublicId: string
  /**
   * Umbral global (0,1] para estado `near` en columnas con límite; v1 default 0.8.
   */
  wipNearThresholdRatio: number
  columns: KanbanColumnState[]
  createdAt: Date
  updatedAt: Date
}
