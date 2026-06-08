import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { DailyAlignmentForbiddenError } from "../domain/daily-alignment.errors.js"
import { assertCanCloseDailyAlignmentSession } from "./daily-alignment-authorization.policy.js"

describe("daily-alignment-authorization.policy", () => {
  it("allows scrum_master to close", () => {
    assert.doesNotThrow(() =>
      assertCanCloseDailyAlignmentSession(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
      ),
    )
  })

  it("allows agility_lead to close", () => {
    assert.doesNotThrow(() =>
      assertCanCloseDailyAlignmentSession(
        minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
      ),
    )
  })

  it("allows admin to close", () => {
    assert.doesNotThrow(() =>
      assertCanCloseDailyAlignmentSession(
        minimalWorkspaceMember({
          workspaceRoleAdministrative: "admin",
          workspaceRoleMethodological: null,
        }),
      ),
    )
  })

  it("allows operator to close", () => {
    assert.doesNotThrow(() =>
      assertCanCloseDailyAlignmentSession(
        minimalWorkspaceMember({
          workspaceRoleAdministrative: "operator",
          workspaceRoleMethodological: null,
        }),
      ),
    )
  })

  it("forbids product_owner from closing (policy v1)", () => {
    assert.throws(
      () =>
        assertCanCloseDailyAlignmentSession(
          minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" }),
        ),
      DailyAlignmentForbiddenError,
    )
  })

  it("forbids scrum_developer from closing", () => {
    assert.throws(
      () =>
        assertCanCloseDailyAlignmentSession(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      DailyAlignmentForbiddenError,
    )
  })

  it("forbids deactivated facilitator", () => {
    assert.throws(
      () =>
        assertCanCloseDailyAlignmentSession(
          minimalWorkspaceMember({
            status: "deactivated",
            workspaceRoleMethodological: "scrum_master",
          }),
        ),
      DailyAlignmentForbiddenError,
    )
  })
})
