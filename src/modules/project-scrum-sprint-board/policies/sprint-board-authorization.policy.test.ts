import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanMutateSprintBoard,
  assertCanReadSprintBoard,
} from "./sprint-board-authorization.policy.js"

describe("sprint-board-authorization.policy", () => {
  describe("assertCanReadSprintBoard", () => {
    it("allows scrum_developer", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintBoard(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })

    it("allows auditor", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintBoard(
          minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
        ),
      )
    })

    it("allows scrum_coach", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintBoard(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
      )
    })

    it("still allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintBoard(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })
  })

  describe("assertCanMutateSprintBoard", () => {
    it("rejects scrum_developer", () => {
      assert.throws(
        () =>
          assertCanMutateSprintBoard(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        /Only admin, operator, agility_lead, scrum_master, or product_owner/,
      )
    })

    it("rejects auditor", () => {
      assert.throws(
        () =>
          assertCanMutateSprintBoard(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /Only admin, operator, agility_lead, scrum_master, or product_owner/,
      )
    })

    it("rejects scrum_coach", () => {
      assert.throws(
        () =>
          assertCanMutateSprintBoard(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
          ),
        /Only admin, operator, agility_lead, scrum_master, or product_owner/,
      )
    })

    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanMutateSprintBoard(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })
  })
})
