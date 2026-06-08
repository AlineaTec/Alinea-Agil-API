import type { WorkControlCriterionConfig } from "./work-ready-done-controls.dto.js"
import { ALL_V1_RULE_IDS, DOR_V1_RULE_IDS } from "./work-ready-done-controls.constants.js"
import type { WorkControlV1RuleId } from "./work-ready-done-controls.constants.js"
import { DOD_DEFAULTS, DOR_DEFAULTS } from "./work-ready-done-criteria.evaluator.js"

const dorSet = new Set<string>(DOR_V1_RULE_IDS)

export function buildDefaultV1Criteria(): WorkControlCriterionConfig[] {
  return ALL_V1_RULE_IDS.map((ruleId) => {
    const id = ruleId as WorkControlV1RuleId
    if (dorSet.has(ruleId)) {
      return { ruleId: id, isEnabled: true, level: DOR_DEFAULTS[ruleId as keyof typeof DOR_DEFAULTS].level }
    }
    return { ruleId: id, isEnabled: true, level: DOD_DEFAULTS[ruleId as keyof typeof DOD_DEFAULTS].level }
  })
}
