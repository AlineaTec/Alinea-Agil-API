import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanMutateSprintPlanning,
  assertCanReadSprintPlanning,
} from "./sprint-planning-authorization.policy.js"

describe("sprint-planning-authorization.policy", () => {
  describe("assertCanReadSprintPlanning", () => {
    it("allows auditor (aligned to sprint board read)", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
        ),
      )
    })

    it("allows scrum_coach", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
      )
    })

    it("allows scrum_developer (aligned to sprint board read)", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })

    it("allows product_owner", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
        ),
      )
    })

    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanReadSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })
  })

  describe("assertCanMutateSprintPlanning", () => {
    it("rejects auditor", () => {
      assert.throws(() =>
        assertCanMutateSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
        ),
      )
    })

    it("rejects scrum_coach", () => {
      assert.throws(() =>
        assertCanMutateSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
      )
    })

    it("rejects scrum_developer", () => {
      assert.throws(() =>
        assertCanMutateSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })

    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanMutateSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })

    it("allows product_owner", () => {
      assert.doesNotThrow(() =>
        assertCanMutateSprintPlanning(
          minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
        ),
      )
    })
  })
})
