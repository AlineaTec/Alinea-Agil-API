import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { WorkTeamForbiddenError } from "../domain/work-team.errors.js"
import {
  assertCanMutateWorkTeams,
  assertCanReadWorkTeamAuditLog,
  assertCanReadWorkTeams,
} from "./work-team-authorization.policy.js"

const WS = "10000000-0000-4000-8000-000000000001"

function member(partial: Partial<WorkspaceMemberState> = {}): WorkspaceMemberState {
  return {
    membershipPublicId: "m-1",
    workspacePublicId: WS,
    userPublicId: "20000000-0000-4000-8000-000000000002",
    emailNormalized: "a@test.dev",
    fullName: "U",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: "scrum_developer",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  }
}

describe("work-team-authorization.policy", () => {
  describe("assertCanReadWorkTeams", () => {
    it("allows active and active_without_seat", () => {
      assertCanReadWorkTeams(member({ status: "active" }))
      assertCanReadWorkTeams(member({ status: "active_without_seat" }))
    })
    it("rejects pending and deactivated", () => {
      assert.throws(() => assertCanReadWorkTeams(member({ status: "pending" })), WorkTeamForbiddenError)
      assert.throws(() => assertCanReadWorkTeams(member({ status: "deactivated" })), WorkTeamForbiddenError)
    })
  })

  describe("assertCanMutateWorkTeams", () => {
    it("allows admin, operator, agility_lead", () => {
      assertCanMutateWorkTeams(member({ workspaceRoleAdministrative: "admin", workspaceRoleMethodological: null }))
      assertCanMutateWorkTeams(member({ workspaceRoleAdministrative: "operator", workspaceRoleMethodological: null }))
      assertCanMutateWorkTeams(member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "agility_lead" }))
    })
    it("rejects scrum_master, product_owner, scrum_developer, scrum_coach, auditor", () => {
      assert.throws(
        () => assertCanMutateWorkTeams(member({ workspaceRoleMethodological: "scrum_master" })),
        WorkTeamForbiddenError,
      )
      assert.throws(
        () => assertCanMutateWorkTeams(member({ workspaceRoleMethodological: "product_owner" })),
        WorkTeamForbiddenError,
      )
      assert.throws(
        () => assertCanMutateWorkTeams(member({ workspaceRoleMethodological: "scrum_developer" })),
        WorkTeamForbiddenError,
      )
      assert.throws(
        () => assertCanMutateWorkTeams(member({ workspaceRoleMethodological: "scrum_coach" })),
        WorkTeamForbiddenError,
      )
      assert.throws(
        () => assertCanMutateWorkTeams(member({ workspaceRoleAdministrative: "auditor", workspaceRoleMethodological: null })),
        WorkTeamForbiddenError,
      )
    })
  })

  describe("assertCanReadWorkTeamAuditLog", () => {
    it("allows admin, operator, agility_lead only", () => {
      assertCanReadWorkTeamAuditLog(member({ workspaceRoleAdministrative: "admin", workspaceRoleMethodological: null }))
      assertCanReadWorkTeamAuditLog(member({ workspaceRoleAdministrative: "operator", workspaceRoleMethodological: null }))
      assertCanReadWorkTeamAuditLog(
        member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "agility_lead" }),
      )
    })
    it("rejects scrum_developer from audit read", () => {
      assert.throws(() => assertCanReadWorkTeamAuditLog(member()), WorkTeamForbiddenError)
    })
  })
})
