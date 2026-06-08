import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanExecuteBoardItemMove,
  assertCanExecuteBoardItemReorder,
} from "./board-column-item-movement-authorization.policy.js"
import { BoardColumnItemMovementForbiddenError } from "../domain/board-column-item-movement.errors.js"

describe("board-column-item-movement authorization", () => {
  it("allows scrum_developer to move and reorder", () => {
    const a = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
    assert.doesNotThrow(() => assertCanExecuteBoardItemMove(a))
    assert.doesNotThrow(() => assertCanExecuteBoardItemReorder(a))
  })

  it("rejects auditor", () => {
    const a = minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })
    assert.throws(() => assertCanExecuteBoardItemMove(a), BoardColumnItemMovementForbiddenError)
  })
})
