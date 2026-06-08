import test from "node:test"
import assert from "node:assert/strict"
import { mergeAcceptanceCriteriaFromPatch } from "./scrum-backlog-acceptance-criteria.validation.js"
import { ScrumBacklogValidationError } from "./scrum-backlog.errors.js"

const existingId = "550e8400-e29b-41d4-a716-446655440001"
const t0 = new Date("2024-01-01T00:00:00.000Z")

test("merge rejects non-empty criteria for epic", () => {
  assert.throws(
    () =>
      mergeAcceptanceCriteriaFromPatch(
        "epic",
        [],
        [{ text: "x", status: "pending" }],
        new Date(),
      ),
    ScrumBacklogValidationError,
  )
})

test("merge preserves createdAt for known id", () => {
  const current = [
    {
      acceptanceCriterionPublicId: existingId,
      text: "Old",
      status: "pending" as const,
      createdAt: t0,
      updatedAt: t0,
    },
  ]
  const now = new Date("2024-06-01T00:00:00.000Z")
  const next = mergeAcceptanceCriteriaFromPatch("user_story", current, [{ acceptanceCriterionPublicId: existingId, text: "New", status: "done" }], now)
  assert.equal(next.length, 1)
  assert.equal(next[0].createdAt.getTime(), t0.getTime())
  assert.equal(next[0].text, "New")
  assert.equal(next[0].status, "done")
})

test("merge rejects unknown id", () => {
  assert.throws(
    () =>
      mergeAcceptanceCriteriaFromPatch(
        "user_story",
        [],
        [{ acceptanceCriterionPublicId: existingId, text: "x", status: "pending" }],
        new Date(),
      ),
    ScrumBacklogValidationError,
  )
})
