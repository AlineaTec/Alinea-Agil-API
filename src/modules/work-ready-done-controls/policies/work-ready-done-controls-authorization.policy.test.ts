import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { WorkControlsForbiddenError } from "../domain/work-ready-done-controls.errors.js"
import {
  assertCanEvaluateWorkControls,
  assertCanIssueWorkControlsOverride,
  assertCanManageWorkControls,
  assertCanReadWorkControls,
} from "./work-ready-done-controls-authorization.policy.js"

describe("work-ready-done-controls authorization", () => {
  it("developer can read and evaluate, not override", () => {
    const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
    assertCanReadWorkControls(dev)
    assertCanEvaluateWorkControls(dev)
    assert.throws(() => assertCanIssueWorkControlsOverride(dev), WorkControlsForbiddenError)
  })

  it("agility_lead can override", () => {
    const m = minimalWorkspaceMember({ workspaceRoleMethodological: "agility_lead" })
    assertCanIssueWorkControlsOverride(m)
  })

  it("scrum_coach can read, not override (v1)", () => {
    const c = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" })
    assertCanReadWorkControls(c)
    assert.throws(() => assertCanIssueWorkControlsOverride(c), WorkControlsForbiddenError)
  })

  it("admin can manage and override", () => {
    const a = minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })
    assertCanManageWorkControls(a)
    assertCanIssueWorkControlsOverride(a)
  })
})
