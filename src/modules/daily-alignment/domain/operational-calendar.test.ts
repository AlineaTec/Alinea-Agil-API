import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatYmdInZone,
  previousBusinessDayYmdFromSessionYmd,
  todayYmdOperational,
  utcWorkDateRangeForOperationalReferenceYmd,
} from "./operational-calendar.js"

describe("operational-calendar", () => {
  it("previousBusinessDayYmdFromSessionYmd skips weekends (America/Mexico_City)", () => {
    // 2026-05-11 is Monday — prior business day should be Friday 2026-05-08
    const ref = previousBusinessDayYmdFromSessionYmd("2026-05-11", "America/Mexico_City")
    assert.equal(ref, "2026-05-08")
  })

  it("formatYmdInZone matches calendar date in zone for UTC noon anchor", () => {
    const d = new Date("2026-05-10T12:00:00.000Z")
    assert.equal(formatYmdInZone(d, "UTC"), "2026-05-10")
  })

  it("todayYmdOperational returns YYYY-MM-DD in zone", () => {
    const ymd = todayYmdOperational("UTC")
    assert.match(ymd, /^\d{4}-\d{2}-\d{2}$/)
  })

  it("utcWorkDateRangeForOperationalReferenceYmd is half-open by UTC calendar day", () => {
    const { from, toExclusive } = utcWorkDateRangeForOperationalReferenceYmd("2026-05-10")
    assert.equal(from.toISOString(), "2026-05-10T00:00:00.000Z")
    assert.equal(toExclusive.toISOString(), "2026-05-11T00:00:00.000Z")
  })
})
