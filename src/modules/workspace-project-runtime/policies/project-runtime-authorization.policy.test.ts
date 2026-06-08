import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { assertCanReadProjectRuntime } from "./project-runtime-authorization.policy.js"

describe("project-runtime-authorization.policy", () => {
  it("allows auditor", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
      ),
    )
  })

  it("allows scrum_coach", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
      ),
    )
  })

  it("allows scrum_developer", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })

  it("allows scrum_master", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
      ),
    )
  })

  it("allows product_owner", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
      ),
    )
  })

  it("still allows agility_lead", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRuntime(
        minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
      ),
    )
  })
})
