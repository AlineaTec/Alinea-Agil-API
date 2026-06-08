import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  KANBAN_MAX_COLUMN_NAME_LENGTH,
  KANBAN_MAX_COLUMNS,
  KANBAN_MAX_POLICY_TEXT_LENGTH,
} from "./kanban-flow.constants.js"
import { KanbanFlowValidationError } from "./kanban-flow.errors.js"
import type { KanbanColumnState } from "./kanban-flow.js"
import { assertValidKanbanFlowColumns } from "./kanban-flow.validation.js"

function col(partial: Partial<KanbanColumnState> & Pick<KanbanColumnState, "columnPublicId" | "position">): KanbanColumnState {
  return {
    name: "Col",
    wipLimit: null,
    policyText: "",
    wipEnforcement: "informational",
    ...partial,
  }
}

describe("assertValidKanbanFlowColumns", () => {
  it("rejects more than KANBAN_MAX_COLUMNS", () => {
    const columns: KanbanColumnState[] = Array.from({ length: KANBAN_MAX_COLUMNS + 1 }, (_, i) =>
      col({ columnPublicId: `id-${i}`, position: i, name: `C${i}` }),
    )
    assert.throws(
      () => assertValidKanbanFlowColumns(columns, columns[0]!.columnPublicId),
      KanbanFlowValidationError,
    )
  })

  it("rejects column name longer than max", () => {
    const id = "a"
    const columns = [col({ columnPublicId: id, position: 0, name: "x".repeat(KANBAN_MAX_COLUMN_NAME_LENGTH + 1) })]
    assert.throws(() => assertValidKanbanFlowColumns(columns, id), KanbanFlowValidationError)
  })

  it("rejects policyText longer than max", () => {
    const id = "a"
    const columns = [
      col({ columnPublicId: id, position: 0, policyText: "p".repeat(KANBAN_MAX_POLICY_TEXT_LENGTH + 1) }),
    ]
    assert.throws(() => assertValidKanbanFlowColumns(columns, id), KanbanFlowValidationError)
  })

  it("rejects entryColumnPublicId not in columns", () => {
    const columns = [col({ columnPublicId: "a", position: 0 }), col({ columnPublicId: "b", position: 1 })]
    assert.throws(() => assertValidKanbanFlowColumns(columns, "missing"), KanbanFlowValidationError)
  })
})
