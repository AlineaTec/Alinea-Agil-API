import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildVariationBlock,
  hasSufficientDataFromPeriodCount,
  readinessFromPeriodCount,
} from "./team-predictability-metrics.aggregation.js"
import { PREDICTABILITY_COV_ELEVATED, PREDICTABILITY_RANGE_RATIO_ELEVATED } from "../domain/team-predictability-metrics.constants.js"

describe("team-predictability-metrics.aggregation", () => {
  describe("readinessFromPeriodCount", () => {
    it("returns insufficient, limited, or adequate from documented thresholds", () => {
      assert.equal(readinessFromPeriodCount(0), "insufficient")
      assert.equal(readinessFromPeriodCount(2), "insufficient")
      assert.equal(readinessFromPeriodCount(3), "limited")
      assert.equal(readinessFromPeriodCount(5), "limited")
      assert.equal(readinessFromPeriodCount(6), "adequate")
      assert.equal(readinessFromPeriodCount(10), "adequate")
    })
  })

  describe("hasSufficientDataFromPeriodCount", () => {
    it("is true when readiness would be adequate (6+), false otherwise", () => {
      assert.equal(hasSufficientDataFromPeriodCount(0), false)
      assert.equal(hasSufficientDataFromPeriodCount(5), false)
      assert.equal(hasSufficientDataFromPeriodCount(6), true)
    })
  })

  describe("buildVariationBlock", () => {
    it("indeterminate when <3 values", () => {
      const b = buildVariationBlock([1, 2], "scrum_velocity", 2)
      assert.equal(b.variationSignalLevel, "indeterminate")
    })
    it("uses CoV and range rule; marks high when either exceeds elevated thresholds (documented v1)", () => {
      const stable = [10, 11, 10, 9, 10, 10]
      const h = buildVariationBlock(stable, "scrum_velocity", 6)
      assert.equal(h.variationSignalLevel, "low")
      const wild = [2, 12, 4, 18, 3, 20]
      const w = buildVariationBlock(wild, "kanban_throughput", 6)
      assert(
        w.coefficientOfVariation! > PREDICTABILITY_COV_ELEVATED ||
          w.rangeRatio! > PREDICTABILITY_RANGE_RATIO_ELEVATED,
      )
      assert.equal(w.variationSignalLevel, "high")
    })
  })
})
