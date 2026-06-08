import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanMutateProjectImpediments,
  assertCanReadProjectImpediments,
} from "./impediment-authorization.policy.js"

describe("impediment-authorization.policy", () => {
  describe("assertCanReadProjectImpediments", () => {
    it("allows auditor via backlog read", () => {
      assert.doesNotThrow(() =>
        assertCanReadProjectImpediments(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      )
    })

    it("allows scrum_developer via sprint board read", () => {
      assert.doesNotThrow(() =>
        assertCanReadProjectImpediments(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("assertCanMutateProjectImpediments", () => {
    it("rejects auditor", () => {
      assert.throws(
        () =>
          assertCanMutateProjectImpediments(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /read-only for impediments/,
      )
    })

    it("rejects scrum_coach", () => {
      assert.throws(
        () =>
          assertCanMutateProjectImpediments(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
          ),
        /read-only for impediments/,
      )
    })

    it("allows scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanMutateProjectImpediments(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })
  })
})
