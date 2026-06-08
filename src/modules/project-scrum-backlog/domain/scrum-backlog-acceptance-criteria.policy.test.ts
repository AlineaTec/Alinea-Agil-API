import test from "node:test"
import assert from "node:assert/strict"
import type { AcceptanceCriterionState } from "./acceptance-criterion.js"
import {
  assertAcceptanceCriteriaChangesAllowed,
  assertCanPatchAcceptanceCriteriaOnly,
} from "./scrum-backlog-acceptance-criteria.policy.js"
import { ScrumBacklogForbiddenError } from "./scrum-backlog.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

function member(partial: Partial<WorkspaceMemberState> & Pick<WorkspaceMemberState, "workspaceRoleAdministrative" | "workspaceRoleMethodological">): WorkspaceMemberState {
  return {
    membershipPublicId: "m1",
    workspacePublicId: "w1",
    userPublicId: "u1",
    emailNormalized: "a@b.c",
    fullName: "T",
    status: "active",
    hasSeatAssigned: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }
}

const criterion = (id: string, text: string, status: AcceptanceCriterionState["status"]): AcceptanceCriterionState => ({
  acceptanceCriterionPublicId: id,
  text,
  status,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-02"),
})

test("assertCanPatchAcceptanceCriteriaOnly allows scrum_developer", () => {
  assertCanPatchAcceptanceCriteriaOnly(
    member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" }),
  )
})

test("assertCanPatchAcceptanceCriteriaOnly rejects auditor", () => {
  assert.throws(
    () =>
      assertCanPatchAcceptanceCriteriaOnly(
        member({ workspaceRoleAdministrative: "auditor", workspaceRoleMethodological: null }),
      ),
    ScrumBacklogForbiddenError,
  )
})

test("developer cannot set reviewed", () => {
  const prev: AcceptanceCriterionState[] = []
  const next = [criterion("550e8400-e29b-41d4-a716-446655440000", "Do X", "reviewed")]
  assert.throws(
    () =>
      assertAcceptanceCriteriaChangesAllowed(
        member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" }),
        prev,
        next,
        false,
      ),
    ScrumBacklogForbiddenError,
  )
})

test("product_owner can set reviewed", () => {
  const prev: AcceptanceCriterionState[] = []
  const next = [criterion("550e8400-e29b-41d4-a716-446655440000", "Do X", "reviewed")]
  assertAcceptanceCriteriaChangesAllowed(
    member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "product_owner" }),
    prev,
    next,
    false,
  )
})

test("developer cannot delete criterion in active sprint", () => {
  const prev = [criterion("550e8400-e29b-41d4-a716-446655440000", "Do X", "done")]
  const next: AcceptanceCriterionState[] = []
  assert.throws(
    () =>
      assertAcceptanceCriteriaChangesAllowed(
        member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" }),
        prev,
        next,
        true,
      ),
    ScrumBacklogForbiddenError,
  )
})

test("developer can delete when not in active sprint", () => {
  const prev = [criterion("550e8400-e29b-41d4-a716-446655440000", "Do X", "done")]
  const next: AcceptanceCriterionState[] = []
  assertAcceptanceCriteriaChangesAllowed(
    member({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" }),
    prev,
    next,
    false,
  )
})
