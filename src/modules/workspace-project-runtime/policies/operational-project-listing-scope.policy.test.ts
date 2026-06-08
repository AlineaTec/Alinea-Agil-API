import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { operationalProjectListingIsWorkspaceWide } from "./operational-project-listing-scope.policy.js"

describe("operational-project-listing-scope.policy", () => {
  it("is workspace-wide for admin and agility_lead", () => {
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" }),
      ),
      true,
    )
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
      ),
      true,
    )
  })

  it("is not workspace-wide for scrum_developer / scrum_coach / scrum_master / product_owner", () => {
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
      false,
    )
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
      ),
      false,
    )
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
      ),
      false,
    )
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
      ),
      false,
    )
  })

  it("is false when deactivated", () => {
    assert.equal(
      operationalProjectListingIsWorkspaceWide(
        minimalWorkspaceMember({
          workspaceRoleAdministrative: "admin",
          status: "deactivated",
        }),
      ),
      false,
    )
  })
})
