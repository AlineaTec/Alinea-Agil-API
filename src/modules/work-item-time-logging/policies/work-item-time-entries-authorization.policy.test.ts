import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { assertCanMutateSprintBoard } from "../../project-scrum-sprint-board/policies/sprint-board-authorization.policy.js"
import { assertCanReadWorkItemComments } from "../../work-item-comments/policies/work-item-comments-authorization.policy.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import {
  assertTimeEntryRequestWorkspaceMatchesActor,
  assertCanReadTimeEntries,
  assertCanCreateTimeEntry,
  assertCanUpdateTimeEntry,
  assertCanDeleteTimeEntry,
} from "./work-item-time-entries-authorization.policy.js"
import { WorkItemTimeEntriesForbiddenError } from "../domain/work-item-time-logging.errors.js"

describe("work-item-time-entries-authorization.policy", () => {
  describe("assertCanReadTimeEntries", () => {
    it("is equivalent a lectura de comentarios (delegación)", () => {
      const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
      assert.doesNotThrow(() => {
        assertCanReadWorkItemComments(dev)
        assertCanReadTimeEntries(dev)
      })
    })

    it("rechaza rol sin acceso a backlog ni board (como comentarios)", () => {
      assert.throws(
        () => assertCanReadTimeEntries(minimalWorkspaceMember()),
        /You do not have permission to read work item comments/,
      )
    })
  })

  describe("assertCanCreateTimeEntry", () => {
    it("rechaza auditor (solo lectura)", () => {
      assert.throws(
        () => assertCanCreateTimeEntry(minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })),
        /read-only/,
      )
    })

    it("permite developer", () => {
      assert.doesNotThrow(() =>
        assertCanCreateTimeEntry(
          minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
        ),
      )
    })
  })

  describe("assertCanUpdateTimeEntry", () => {
    it("propia: exige misma regla que crear", () => {
      const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
      assert.doesNotThrow(() => assertCanUpdateTimeEntry(dev, true))
    })

    it("ajena: misma “moderación” que sprint board (no developer)", () => {
      const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
      assert.throws(() => assertCanUpdateTimeEntry(dev, false), /Only admin, operator, agility_lead, scrum_master, or product_owner/)
    })

    it("ajena: scrum_master según assertCanMutateSprintBoard", () => {
      const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
      assert.doesNotThrow(() => {
        assertCanUpdateTimeEntry(sm, false)
        assertCanMutateSprintBoard(sm)
      })
    })
  })

  describe("assertCanDeleteTimeEntry", () => {
    it("comportamiento espejo a update (propia vs any)", () => {
      const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
      assert.doesNotThrow(() => assertCanDeleteTimeEntry(dev, true))
      assert.throws(() => assertCanDeleteTimeEntry(dev, false), /Only admin, operator, agility_lead, scrum_master, or product_owner/)
    })
  })

  describe("assertTimeEntryRequestWorkspaceMatchesActor", () => {
    it("rechaza si el path de workspace no coincide con el asiento", () => {
      const actor = minimalWorkspaceMember({ workspacePublicId: "w-a" })
      assert.throws(
        () => assertTimeEntryRequestWorkspaceMatchesActor("w-b", actor),
        WorkItemTimeEntriesForbiddenError,
      )
    })
  })
})
