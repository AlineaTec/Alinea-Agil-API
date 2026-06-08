import test from "node:test"
import assert from "node:assert/strict"
import { assertStoryPointsValueForItemType } from "./scrum-backlog-operational-fields.policy.js"
import { ScrumBacklogValidationError } from "./scrum-backlog.errors.js"

test("assertStoryPointsValueForItemType allows null for epic", () => {
  assertStoryPointsValueForItemType("epic", null)
})

test("assertStoryPointsValueForItemType rejects non-null for epic", () => {
  assert.throws(
    () => assertStoryPointsValueForItemType("epic", 3),
    ScrumBacklogValidationError,
  )
})

test("assertStoryPointsValueForItemType allows integer for user_story", () => {
  assertStoryPointsValueForItemType("user_story", 5)
  assertStoryPointsValueForItemType("user_story", 0)
  assertStoryPointsValueForItemType("user_story", null)
})

test("assertStoryPointsValueForItemType allows integer for bug", () => {
  assertStoryPointsValueForItemType("bug", 2)
  assertStoryPointsValueForItemType("bug", null)
})

test("assertStoryPointsValueForItemType rejects float for user_story", () => {
  assert.throws(
    () => assertStoryPointsValueForItemType("user_story", 3.5),
    ScrumBacklogValidationError,
  )
})

test("assertStoryPointsValueForItemType rejects negative", () => {
  assert.throws(
    () => assertStoryPointsValueForItemType("task", -1),
    ScrumBacklogValidationError,
  )
})
