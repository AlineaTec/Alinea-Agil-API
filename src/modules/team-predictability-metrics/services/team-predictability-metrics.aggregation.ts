import type { MethodologyContext } from "../../team-operational-metrics/domain/team-operational-metrics.dto.js"
import { methodologyFlagsFrom } from "../domain/team-predictability-metrics.utils.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import {
  PREDICTABILITY_COV_ELEVATED,
  PREDICTABILITY_COVERAGE_EPS,
  PREDICTABILITY_RANGE_RATIO_ELEVATED,
} from "../domain/team-predictability-metrics.constants.js"
import type {
  ReadinessLevel,
  StabilityBand,
  VariationBlock,
  VariationSignalLevel,
} from "../domain/team-predictability-metrics.dto.js"

export { methodologyFlagsFrom } from "../domain/team-predictability-metrics.utils.js"

export function loadMethodologyForProjects(
  byProject: Map<string, WorkspaceRuntimeProjectState>,
  projectIds: string[],
): MethodologyContext {
  const flags = { scrum: 0, kanban: 0, other: 0 }
  for (const pid of projectIds) {
    const p = byProject.get(pid)
    if (!p) continue
    if (p.operationalApproach === "scrum") flags.scrum += 1
    else if (p.operationalApproach === "kanban") flags.kanban += 1
    else flags.other += 1
  }
  return methodologyFlagsFrom(flags)
}

export function readinessFromPeriodCount(n: number): ReadinessLevel {
  if (n < 3) return "insufficient"
  if (n < 6) return "limited"
  return "adequate"
}

/** Alineado con `readiness === "adequate"`: 6+ periodos comparables. */
export function hasSufficientDataFromPeriodCount(n: number): boolean {
  return n >= 6
}

function mean(a: number[]): number {
  if (a.length === 0) return 0
  return a.reduce((s, x) => s + x, 0) / a.length
}

function sampleStdev(a: number[], m: number): number {
  if (a.length < 2) return 0
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)
  return Math.sqrt(v)
}

/**
 * v1: CoV = σ/μ; regla auxiliar (max−min)/max(μ,ε).
 * `elevated` si CoV>0,35 o ratio rango>0,5.
 */
export function buildVariationBlock(
  values: number[],
  base: VariationBlock["base"],
  periodsUsed: number,
): VariationBlock {
  if (periodsUsed < 3 || values.length < 3 || base === "none") {
    return {
      base,
      coefficientOfVariation: null,
      rangeRatio: null,
      variationSignalLevel: "indeterminate",
      stabilityBand: "indeterminate",
    }
  }
  const m = mean(values)
  if (m <= PREDICTABILITY_COVERAGE_EPS) {
    return {
      base,
      coefficientOfVariation: null,
      rangeRatio: null,
      variationSignalLevel: "indeterminate",
      stabilityBand: "indeterminate",
    }
  }
  const stdev = sampleStdev(values, m)
  const cov = stdev / m
  const mx = Math.max(...values)
  const mi = Math.min(...values)
  const rangeRatio = (mx - mi) / Math.max(m, PREDICTABILITY_COVERAGE_EPS)

  let level: VariationSignalLevel
  if (cov > PREDICTABILITY_COV_ELEVATED || rangeRatio > PREDICTABILITY_RANGE_RATIO_ELEVATED) {
    level = "high"
  } else if (cov > 0.2 || rangeRatio > 0.25) {
    level = "moderate"
  } else {
    level = "low"
  }

  let band: StabilityBand
  if (level === "high") band = "less_stable"
  else if (level === "low") band = "more_stable"
  else band = "moderate_stability"

  return {
    base,
    coefficientOfVariation: Math.round(cov * 10_000) / 10_000,
    rangeRatio: Math.round(rangeRatio * 10_000) / 10_000,
    variationSignalLevel: level,
    stabilityBand: band,
  }
}
