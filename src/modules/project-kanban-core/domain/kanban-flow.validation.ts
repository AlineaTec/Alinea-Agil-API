import {
  KANBAN_MAX_COLUMN_NAME_LENGTH,
  KANBAN_MAX_COLUMNS,
  KANBAN_MAX_POLICY_TEXT_LENGTH,
} from "./kanban-flow.constants.js"
import { KanbanFlowValidationError } from "./kanban-flow.errors.js"
import type { KanbanColumnState, ProjectKanbanFlowConfigState } from "./kanban-flow.js"

/**
 * Valida columnas + entrada antes de persistir (actualización futura del flujo).
 * La plantilla por defecto ya cumple; este helper centraliza reglas para backlog/board.
 */
export function assertValidKanbanFlowColumns(
  columns: KanbanColumnState[],
  entryColumnPublicId: string,
): void {
  if (columns.length < 1 || columns.length > KANBAN_MAX_COLUMNS) {
    throw new KanbanFlowValidationError(
      `Kanban flow must have between 1 and ${KANBAN_MAX_COLUMNS} columns; got ${columns.length}.`,
    )
  }

  const ids = new Set<string>()
  const positions = new Set<number>()
  for (const col of columns) {
    if (!col.columnPublicId?.trim()) {
      throw new KanbanFlowValidationError("Each column must have a non-empty columnPublicId.")
    }
    if (ids.has(col.columnPublicId)) {
      throw new KanbanFlowValidationError(`Duplicate columnPublicId: ${col.columnPublicId}.`)
    }
    ids.add(col.columnPublicId)

    if (!Number.isInteger(col.position) || col.position < 0) {
      throw new KanbanFlowValidationError(`Invalid position for column ${col.columnPublicId}.`)
    }
    if (positions.has(col.position)) {
      throw new KanbanFlowValidationError(`Duplicate column position: ${col.position}.`)
    }
    positions.add(col.position)

    const name = col.name?.trim() ?? ""
    if (name.length < 1 || name.length > KANBAN_MAX_COLUMN_NAME_LENGTH) {
      throw new KanbanFlowValidationError(
        `Column name length must be 1–${KANBAN_MAX_COLUMN_NAME_LENGTH}; column ${col.columnPublicId}.`,
      )
    }

    if (col.policyText.length > KANBAN_MAX_POLICY_TEXT_LENGTH) {
      throw new KanbanFlowValidationError(
        `policyText must be at most ${KANBAN_MAX_POLICY_TEXT_LENGTH} characters.`,
      )
    }

    if (col.wipLimit !== null) {
      if (!Number.isInteger(col.wipLimit) || col.wipLimit < 1) {
        throw new KanbanFlowValidationError(
          `wipLimit must be null or an integer >= 1; column ${col.columnPublicId}.`,
        )
      }
    }

    if (
      col.wipEnforcement !== "informational" &&
      col.wipEnforcement !== "warning" &&
      col.wipEnforcement !== "blocking"
    ) {
      throw new KanbanFlowValidationError(
        `wipEnforcement must be informational, warning, or blocking; column ${col.columnPublicId}.`,
      )
    }
  }

  if (!ids.has(entryColumnPublicId)) {
    throw new KanbanFlowValidationError("entryColumnPublicId must match an existing column.")
  }
}

export function assertValidProjectKanbanFlowConfigState(
  flow: Pick<ProjectKanbanFlowConfigState, "columns" | "entryColumnPublicId" | "wipNearThresholdRatio">,
): void {
  assertValidKanbanFlowColumns(flow.columns, flow.entryColumnPublicId)
  const r = flow.wipNearThresholdRatio
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0 || r > 1) {
    throw new KanbanFlowValidationError("wipNearThresholdRatio must be a number in (0, 1].")
  }
}
