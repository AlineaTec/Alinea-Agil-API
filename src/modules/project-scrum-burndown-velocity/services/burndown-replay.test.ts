import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  enumerateUtcCalendarDaysInclusive,
  idealRemainingLinear,
  parseSprintBoardMove,
  utcYmd,
} from "./burndown-replay.js"

describe("burndown-replay", () => {
  it("enumerateUtcCalendarDaysInclusive is inclusive on UTC dates", () => {
    const start = new Date(Date.UTC(2025, 0, 1, 12, 0, 0))
    const end = new Date(Date.UTC(2025, 0, 3, 8, 0, 0))
    const days = enumerateUtcCalendarDaysInclusive(start, end)
    assert.deepEqual(days, ["2025-01-01", "2025-01-02", "2025-01-03"])
  })

  it("idealRemainingLinear reaches 0 on last day", () => {
    const n = 5
    const init = 40
    assert.equal(idealRemainingLinear(init, 0, n), 40)
    assert.equal(idealRemainingLinear(init, n - 1, n), 0)
  })

  it("idealRemainingLinear single day is 0", () => {
    assert.equal(idealRemainingLinear(10, 0, 1), 0)
  })

  it("utcYmd formats UTC", () => {
    assert.equal(utcYmd(new Date(Date.UTC(2025, 11, 9, 0, 0, 0))), "2025-12-09")
  })

  it("parseSprintBoardMove accepts sprint board audit nextValue", () => {
    const p = parseSprintBoardMove(
      { sprintPublicId: "sp-1", boardColumn: "done", backlogStatus: "done" },
      "sp-1",
    )
    assert.equal(p?.boardColumn, "done")
  })

  it("parseSprintBoardMove rejects other sprint", () => {
    assert.equal(
      parseSprintBoardMove({ sprintPublicId: "sp-2", boardColumn: "done" }, "sp-1"),
      null,
    )
  })
})
