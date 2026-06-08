import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanReadTeamOperationalCrossTeam,
  assertCanReadTeamOperationalMemberBreakdown,
  assertCanReadTeamOperationalSummary,
} from "./team-operational-metrics-authorization.policy.js"
import { TeamOperationalMetricsForbiddenError } from "../domain/team-operational-metrics.errors.js"

describe("team-operational-metrics-authorization.policy", () => {
  describe("assertCanReadTeamOperationalSummary", () => {
    it("allows any active member (incl. auditor) for aggregate read", () => {
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalSummary(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalSummary(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("assertCanReadTeamOperationalMemberBreakdown", () => {
    it("allows admin, operator, agility_lead, sm, po, scrum_coach", () => {
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalMemberBreakdown(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalMemberBreakdown(minimalWorkspaceMember({ workspaceRoleAdministrative: "operator" })),
      )
      for (const mr of ["agility_lead", "scrum_master", "product_owner", "scrum_coach"] as const) {
        assert.doesNotThrow(() =>
          assertCanReadTeamOperationalMemberBreakdown(minimalWorkspaceMember({ workspaceRoleMethodological: mr })),
        )
      }
    })
    it("rejects scrum_developer", () => {
      assert.throws(
        () =>
          assertCanReadTeamOperationalMemberBreakdown(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        (e: unknown) => e instanceof TeamOperationalMetricsForbiddenError,
      )
    })
    it("rejects auditor", () => {
      assert.throws(
        () =>
          assertCanReadTeamOperationalMemberBreakdown(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /Auditor/,
      )
    })
  })

  describe("assertCanReadTeamOperationalCrossTeam", () => {
    it("allows admin, operator, sm, po, agility_lead, scrum_coach", () => {
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalCrossTeam(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadTeamOperationalCrossTeam(
          minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
        ),
      )
    })
    it("rejects scrum_developer and auditor for cross-team list", () => {
      assert.throws(
        () =>
          assertCanReadTeamOperationalCrossTeam(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        /cross-team/,
      )
      assert.throws(
        () =>
          assertCanReadTeamOperationalCrossTeam(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
          ),
        /Auditor/,
      )
    })
  })
})
