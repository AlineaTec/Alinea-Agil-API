import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertCanReadFlowAssignmentQuality,
  assertCanReadFlowDeliveryCrossTeam,
  assertCanReadFlowDeliverySummary,
  isFlowAssignmentQualityReadable,
} from "./team-flow-delivery-metrics-authorization.policy.js"
import { TeamFlowDeliveryMetricsForbiddenError } from "../domain/team-flow-delivery-metrics.errors.js"

describe("team-flow-delivery-metrics-authorization.policy", () => {
  describe("assertCanReadFlowDeliverySummary", () => {
    it("allows any active member for summary (incl. auditor and scrum_developer)", () => {
      assert.doesNotThrow(() =>
        assertCanReadFlowDeliverySummary(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadFlowDeliverySummary(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("isFlowAssignmentQualityReadable", () => {
    it("is false for scrum_developer and auditor; true for sm and admin", () => {
      assert.equal(
        isFlowAssignmentQualityReadable(minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })),
        false,
      )
      assert.equal(
        isFlowAssignmentQualityReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        false,
      )
      assert.equal(
        isFlowAssignmentQualityReadable(minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })),
        true,
      )
      assert.equal(
        isFlowAssignmentQualityReadable(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
        true,
      )
    })
  })

  describe("assertCanReadFlowAssignmentQuality", () => {
    it("rejects scrum_developer and auditor with forbidden", () => {
      assert.throws(
        () =>
          assertCanReadFlowAssignmentQuality(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
          ),
        (e: unknown) => e instanceof TeamFlowDeliveryMetricsForbiddenError,
      )
      assert.throws(
        () =>
          assertCanReadFlowAssignmentQuality(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        (e: unknown) => e instanceof TeamFlowDeliveryMetricsForbiddenError,
      )
    })
  })

  describe("assertCanReadFlowDeliveryCrossTeam", () => {
    it("rejects scrum_developer and auditor for cross-team list v1", () => {
      assert.throws(
        () =>
          assertCanReadFlowDeliveryCrossTeam(
            minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
        /cross-team/,
      )
      assert.throws(
        () =>
          assertCanReadFlowDeliveryCrossTeam(
            minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" }),
        ),
        /Auditor/,
      )
    })
    it("allows agility_lead and admin for cross-team", () => {
      assert.doesNotThrow(() =>
        assertCanReadFlowDeliveryCrossTeam(minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" })),
      )
      assert.doesNotThrow(() =>
        assertCanReadFlowDeliveryCrossTeam(minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })),
      )
    })
  })
})
