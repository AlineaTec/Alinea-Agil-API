import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanModerateWorkItemComments,
  assertCanMutateOwnWorkItemComment,
  assertCanReadWorkItemComments,
} from "./work-item-comments-authorization.policy.js"

describe("work-item-comments-authorization.policy", () => {
  describe("assertCanReadWorkItemComments", () => {
    it("allows scrum_developer (board read family)", () => {
      assert.doesNotThrow(() =>
        assertCanReadWorkItemComments(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })

    it("allows auditor via backlog read", () => {
      assert.doesNotThrow(() =>
        assertCanReadWorkItemComments(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      )
    })

    it("allows scrum_coach via backlog read", () => {
      assert.doesNotThrow(() =>
        assertCanReadWorkItemComments(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
      )
    })

    it("rejects unrelated role", () => {
      assert.throws(
        () => assertCanReadWorkItemComments(minimalWorkspaceMember()),
        /You do not have permission to read work item comments/,
      )
    })
  })

  describe("assertCanMutateOwnWorkItemComment", () => {
    it("rejects auditor", () => {
      assert.throws(
        () =>
          assertCanMutateOwnWorkItemComment(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /Auditor role is read-only/,
      )
    })

    it("rejects scrum_coach", () => {
      assert.throws(
        () =>
          assertCanMutateOwnWorkItemComment(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
          ),
        /Scrum coach role is read-only/,
      )
    })

    it("allows scrum_developer", () => {
      assert.doesNotThrow(() =>
        assertCanMutateOwnWorkItemComment(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("assertCanModerateWorkItemComments", () => {
    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanModerateWorkItemComments(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })

    it("rejects scrum_developer", () => {
      assert.throws(
        () =>
          assertCanModerateWorkItemComments(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        /Only admin, operator, agility_lead, scrum_master, or product_owner/,
      )
    })
  })
})
