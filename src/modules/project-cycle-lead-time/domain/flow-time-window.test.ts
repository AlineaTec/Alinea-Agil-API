import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveFlowTimeWindow } from "./flow-time-window.js"

describe("flow-time-window", () => {
  it("defecto: ~12 semanas hacia atrás, to = now", () => {
    const now = new Date("2026-04-09T12:00:00.000Z")
    const w = resolveFlowTimeWindow({}, now)
    const days = (w.to.getTime() - w.from.getTime()) / 86_400_000
    assert.equal(Math.round(days), 12 * 7)
  })

  it("from/to explícitos: from < to", () => {
    const now = new Date("2026-04-09T12:00:00.000Z")
    const w = resolveFlowTimeWindow(
      { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      now,
    )
    assert.equal(w.from.toISOString(), "2026-01-01T00:00:00.000Z")
    assert.equal(w.to.toISOString(), "2026-02-01T00:00:00.000Z")
  })
})
