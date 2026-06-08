import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { KanbanMetricsForbiddenError } from "../domain/kanban-metrics.errors.js"
import { assertCanReadKanbanMetrics } from "./kanban-metrics-authorization.policy.js"

describe("kanban-metrics-authorization.policy (kanban.metrics.read v1)", () => {
  it("allows scrum_developer", () => {
    assert.doesNotThrow(() =>
      assertCanReadKanbanMetrics(minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })),
    )
  })

  it("allows auditor", () => {
    assert.doesNotThrow(() =>
      assertCanReadKanbanMetrics(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
    )
  })

  it("rejects member without methodological or admin role", () => {
    assert.throws(
      () => assertCanReadKanbanMetrics(minimalWorkspaceMember({})),
      KanbanMetricsForbiddenError,
    )
  })

  it("rejects deactivated", () => {
    assert.throws(
      () =>
        assertCanReadKanbanMetrics(
          minimalWorkspaceMember({
            status: "deactivated",
            workspaceRoleMethodological: "scrum_developer",
          }),
        ),
      KanbanMetricsForbiddenError,
    )
  })
})
