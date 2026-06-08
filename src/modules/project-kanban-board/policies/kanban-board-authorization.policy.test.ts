import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { KanbanBoardForbiddenError } from "../domain/kanban-board.errors.js"
import {
  assertCanBlockKanbanBoardItems,
  assertCanMoveKanbanBoardItem,
  assertCanReadKanbanBoard,
  assertCanReturnKanbanBoardItemsToBacklog,
} from "./kanban-board-authorization.policy.js"

describe("kanban-board-authorization.policy", () => {
  it("allows auditor to read snapshot", () => {
    assert.doesNotThrow(() =>
      assertCanReadKanbanBoard(
        minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
      ),
    )
  })

  it("allows scrum_developer to read snapshot", () => {
    assert.doesNotThrow(() =>
      assertCanReadKanbanBoard(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })

  it("rejects auditor for move", () => {
    assert.throws(
      () => assertCanMoveKanbanBoardItem(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      KanbanBoardForbiddenError,
    )
  })

  it("allows scrum_developer to move", () => {
    assert.doesNotThrow(() =>
      assertCanMoveKanbanBoardItem(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })

  it("rejects scrum_developer for return to backlog (kanban.board.return_to_backlog)", () => {
    assert.throws(
      () =>
        assertCanReturnKanbanBoardItemsToBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      KanbanBoardForbiddenError,
    )
  })

  it("allows scrum_developer to block (kanban.board.block)", () => {
    assert.doesNotThrow(() =>
      assertCanBlockKanbanBoardItems(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })
})
