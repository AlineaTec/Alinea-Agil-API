import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanReadPredictabilityCrossTeam,
  assertCanReadPredictabilityPeriodTrend,
  assertCanReadPredictabilitySummary,
  isPredictabilityCrossTeamReadable,
  isPredictabilityPeriodTrendReadable,
} from "./team-predictability-metrics-authorization.policy.js"
import { TeamPredictabilityMetricsForbiddenError } from "../domain/team-predictability-metrics.errors.js"

describe("team-predictability-metrics-authorization.policy", () => {
  describe("assertCanReadPredictabilitySummary", () => {
    it("allows any active member for summary, including auditor and scrum_developer", () => {
      assert.doesNotThrow(() =>
        assertCanReadPredictabilitySummary(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadPredictabilitySummary(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("isPredictabilityPeriodTrendReadable", () => {
    it("is true for admin, operator, agility_lead, scrum_master, product_owner, scrum_coach; false for auditor and scrum_developer", () => {
      assert.equal(
        isPredictabilityPeriodTrendReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        false,
      )
      assert.equal(
        isPredictabilityPeriodTrendReadable(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
        false,
      )
      assert.equal(
        isPredictabilityPeriodTrendReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
        true,
      )
      assert.equal(
        isPredictabilityPeriodTrendReadable(
          minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" }),
        ),
        true,
      )
      assert.equal(
        isPredictabilityPeriodTrendReadable(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" }),
        ),
        true,
      )
    })
  })

  describe("isPredictabilityCrossTeamReadable", () => {
    it("mirrors period-trend gating in v1", () => {
      assert.equal(
        isPredictabilityCrossTeamReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        false,
      )
      assert.equal(
        isPredictabilityCrossTeamReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
        true,
      )
    })
  })

  describe("assertCanReadPredictabilityPeriodTrend", () => {
    it("rejects auditor and scrum_developer", () => {
      assert.throws(
        () => assertCanReadPredictabilityPeriodTrend(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        (e: unknown) => e instanceof TeamPredictabilityMetricsForbiddenError,
      )
      assert.throws(
        () =>
          assertCanReadPredictabilityPeriodTrend(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        (e: unknown) => e instanceof TeamPredictabilityMetricsForbiddenError,
      )
    })
    it("allows admin and scrum_master", () => {
      assert.doesNotThrow(() =>
        assertCanReadPredictabilityPeriodTrend(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadPredictabilityPeriodTrend(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" }),
        ),
      )
    })
  })

  describe("assertCanReadPredictabilityCrossTeam", () => {
    it("rejects auditor and scrum_developer", () => {
      assert.throws(
        () => assertCanReadPredictabilityCrossTeam(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        (e: unknown) => e instanceof TeamPredictabilityMetricsForbiddenError,
      )
      assert.throws(
        () =>
          assertCanReadPredictabilityCrossTeam(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        (e: unknown) => e instanceof TeamPredictabilityMetricsForbiddenError,
      )
    })
  })
})
