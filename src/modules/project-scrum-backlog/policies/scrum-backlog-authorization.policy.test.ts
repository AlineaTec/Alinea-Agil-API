import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanMutateScrumBacklog,
  assertCanReadScrumBacklog,
} from "./scrum-backlog-authorization.policy.js"

describe("scrum-backlog-authorization.policy", () => {
  describe("assertCanReadScrumBacklog", () => {
    it("allows auditor", () => {
      assert.doesNotThrow(() =>
        assertCanReadScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
        ),
      )
    })

    it("allows scrum_coach", () => {
      assert.doesNotThrow(() =>
        assertCanReadScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
      )
    })

    it("allows scrum_developer", () => {
      assert.doesNotThrow(() =>
        assertCanReadScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })

    it("allows product_owner", () => {
      assert.doesNotThrow(() =>
        assertCanReadScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
        ),
      )
    })

    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanReadScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })

    it("rejects member without backlog read role", () => {
      assert.throws(
        () => assertCanReadScrumBacklog(minimalWorkspaceMember()),
        /Your workspace role does not allow read access to the Scrum backlog/,
      )
    })
  })

  describe("assertCanMutateScrumBacklog", () => {
    it("rejects auditor", () => {
      assert.throws(
        () =>
          assertCanMutateScrumBacklog(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /Only admin, operator, or agility_lead/,
      )
    })

    it("rejects scrum_coach", () => {
      assert.throws(
        () =>
          assertCanMutateScrumBacklog(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
          ),
        /Only admin, operator, or agility_lead/,
      )
    })

    it("rejects scrum_developer", () => {
      assert.throws(
        () =>
          assertCanMutateScrumBacklog(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        /Only admin, operator, or agility_lead/,
      )
    })

    it("allows agility_lead", () => {
      assert.doesNotThrow(() =>
        assertCanMutateScrumBacklog(
          minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
        ),
      )
    })
  })
})
