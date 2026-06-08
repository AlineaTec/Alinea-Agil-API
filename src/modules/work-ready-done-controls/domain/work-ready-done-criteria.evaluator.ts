import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ImpedimentState } from "../../project-impediments/domain/impediment.js"
import type { WorkControlCriterionConfig, WorkControlsEvaluationResult } from "./work-ready-done-controls.dto.js"
import type { WorkControlEventCode } from "./work-ready-done-controls.constants.js"
import { DOR_V1_RULE_IDS, DOD_V1_RULE_IDS } from "./work-ready-done-controls.constants.js"
import { WorkControlsValidationError } from "./work-ready-done-controls.errors.js"

const OPEN_IMPEDIMENT: ImpedimentState["status"][] = ["open", "in_review", "mitigating"]

function isOpenCriticalImpedimentForItem(i: ImpedimentState, workItemPublicId: string): boolean {
  if (i.severity !== "critical") return false
  if (i.relatedWorkItemPublicId !== workItemPublicId) return false
  return OPEN_IMPEDIMENT.includes(i.status)
}

function configMap(criteria: WorkControlCriterionConfig[]): Map<string, WorkControlCriterionConfig> {
  const m = new Map<string, WorkControlCriterionConfig>()
  for (const c of criteria) m.set(c.ruleId, c)
  return m
}

function getEnabledLevel(
  map: Map<string, WorkControlCriterionConfig>,
  ruleId: (typeof DOR_V1_RULE_IDS)[number] | (typeof DOD_V1_RULE_IDS)[number],
  defaultLevel: "informational" | "warning" | "blocking",
): { enabled: boolean; level: "informational" | "warning" | "blocking" } {
  const c = map.get(ruleId)
  if (!c) return { enabled: true, level: defaultLevel }
  return { enabled: c.isEnabled, level: c.level }
}

type EvalCtx = {
  item: ScrumBacklogItemState
  projectApproach: "scrum" | "kanban"
  eventCode: WorkControlEventCode
  impediments: readonly ImpedimentState[]
}

function evalDorRow(
  ruleId: (typeof DOR_V1_RULE_IDS)[number],
  ctx: EvalCtx,
  map: Map<string, WorkControlCriterionConfig>,
  defaults: Record<(typeof DOR_V1_RULE_IDS)[number], { level: "informational" | "warning" | "blocking" }>,
): import("./work-ready-done-controls.dto.js").CriterionEvaluationRow {
  const { enabled, level } = getEnabledLevel(map, ruleId, defaults[ruleId].level)
  const { item, projectApproach, impediments } = ctx
  const wid = item.backlogItemPublicId

  let na = false
  let pass = true
  let messageCode = `${ruleId}.ok`

  if (!enabled) {
    na = true
    pass = true
    messageCode = `${ruleId}.disabled`
  } else
    switch (ruleId) {
      case "dor_title_present": {
        pass = item.title.trim().length > 0
        if (!pass) messageCode = "dor_title_present.empty"
        break
      }
      case "dor_description_present": {
        pass = item.description.trim().length > 0
        if (!pass) messageCode = "dor_description_present.empty"
        break
      }
      case "dor_acceptance_criteria_present": {
        if (item.itemType === "epic") {
          na = true
        } else {
          pass = (item.acceptanceCriteria?.length ?? 0) >= 1
          if (!pass) messageCode = "dor_acceptance_criteria_present.missing"
        }
        break
      }
      case "dor_priority_defined": {
        pass = item.priorityLevel !== "none"
        if (!pass) messageCode = "dor_priority_defined.none"
        break
      }
      case "dor_story_points_if_scrum": {
        if (projectApproach !== "scrum") na = true
        else if (item.itemType !== "user_story" && item.itemType !== "task") na = true
        else {
          pass = item.storyPoints != null
          if (!pass) messageCode = "dor_story_points_if_scrum.missing"
        }
        break
      }
      case "dor_no_open_critical_impediment": {
        const bad = impediments.some((i) => isOpenCriticalImpedimentForItem(i, wid))
        pass = !bad
        if (!pass) messageCode = "dor_no_open_critical_impediment.found"
        break
      }
      case "dor_assignee_present": {
        pass = item.assignedUserPublicId != null && item.assignedUserPublicId.trim() !== ""
        if (!pass) messageCode = "dor_assignee_present.missing"
        break
      }
      default: {
        const _ex: never = ruleId
        throw new WorkControlsValidationError(`Unimplemented DoR rule: ${_ex}`)
      }
    }

  return {
    ruleId,
    level,
    isEnabled: enabled,
    notApplicable: na,
    pass: na || pass,
    messageCode: na ? `${ruleId}.not_applicable` : messageCode,
  }
}

function evalDodRow(
  ruleId: (typeof DOD_V1_RULE_IDS)[number],
  ctx: EvalCtx,
  map: Map<string, WorkControlCriterionConfig>,
  defaults: Record<(typeof DOD_V1_RULE_IDS)[number], { level: "informational" | "warning" | "blocking" }>,
): import("./work-ready-done-controls.dto.js").CriterionEvaluationRow {
  const { enabled, level } = getEnabledLevel(map, ruleId, defaults[ruleId].level)
  const { item, projectApproach, impediments, eventCode } = ctx
  const wid = item.backlogItemPublicId

  let na = false
  let pass = true
  let messageCode = `${ruleId}.ok`

  if (eventCode !== "done_close_item") {
    throw new WorkControlsValidationError("DoD rules only for done_close_item")
  }

  if (!enabled) {
    na = true
    pass = true
    messageCode = `${ruleId}.disabled`
  } else
    switch (ruleId) {
      case "dod_acceptance_criteria_satisfied": {
        if (item.itemType === "epic") {
          na = true
        } else if ((item.acceptanceCriteria?.length ?? 0) === 0) {
          pass = false
          messageCode = "dod_acceptance_criteria_satisfied.empty_list"
        } else {
          const allDone = item.acceptanceCriteria!.every((c) => c.status === "done" || c.status === "reviewed")
          pass = allDone
          if (!pass) messageCode = "dod_acceptance_criteria_satisfied.pending"
        }
        break
      }
      case "dod_no_open_critical_impediment": {
        const bad = impediments.some((i) => isOpenCriticalImpedimentForItem(i, wid))
        pass = !bad
        if (!pass) messageCode = "dod_no_open_critical_impediment.found"
        break
      }
      case "dod_not_blocked": {
        pass = item.isBlocked !== true
        if (!pass) messageCode = "dod_not_blocked.item_blocked"
        break
      }
      case "dod_status_ready_for_done": {
        if (projectApproach === "kanban") {
          na = true
        } else {
          pass = item.status === "in_progress"
          if (!pass) messageCode = "dod_status_ready_for_done.not_in_progress"
        }
        break
      }
      default: {
        const _ex: never = ruleId
        throw new WorkControlsValidationError(`Unimplemented DoD rule: ${_ex}`)
      }
    }

  return {
    ruleId,
    level,
    isEnabled: enabled,
    notApplicable: na,
    pass: na || pass,
    messageCode: na ? `${ruleId}.not_applicable` : messageCode,
  }
}

/** Alinea a criterios v1; proyecto nuevo mayoritariamente informativo (OQ-11), salvo riesgo/cierre. */
export const DOR_DEFAULTS: Record<
  (typeof DOR_V1_RULE_IDS)[number],
  { level: "informational" | "warning" | "blocking" }
> = {
  dor_title_present: { level: "informational" },
  dor_description_present: { level: "informational" },
  dor_acceptance_criteria_present: { level: "informational" },
  dor_priority_defined: { level: "informational" },
  dor_story_points_if_scrum: { level: "informational" },
  dor_no_open_critical_impediment: { level: "blocking" },
  dor_assignee_present: { level: "warning" },
}

export const DOD_DEFAULTS: Record<
  (typeof DOD_V1_RULE_IDS)[number],
  { level: "informational" | "warning" | "blocking" }
> = {
  dod_acceptance_criteria_satisfied: { level: "blocking" },
  dod_no_open_critical_impediment: { level: "blocking" },
  dod_not_blocked: { level: "blocking" },
  dod_status_ready_for_done: { level: "warning" },
}

function aggregate(
  rows: import("./work-ready-done-controls.dto.js").CriterionEvaluationRow[],
): {
  effectiveLevel: WorkControlsEvaluationResult["effectiveLevel"]
  canContinue: boolean
  requiresAcknowledgment: boolean
  canResolveWithOverride: boolean
  failedBlockingRuleIds: string[]
  failedWarningRuleIds: string[]
} {
  const failedBlock: string[] = []
  const failedWarn: string[] = []
  for (const r of rows) {
    if (!r.isEnabled) continue
    if (r.notApplicable) continue
    if (r.pass) continue
    if (r.level === "blocking") failedBlock.push(r.ruleId)
    else if (r.level === "warning") failedWarn.push(r.ruleId)
  }
  const blocking = failedBlock.length > 0
  const warning = failedWarn.length > 0
  if (blocking) {
    return {
      effectiveLevel: "blocking",
      canContinue: false,
      requiresAcknowledgment: false,
      canResolveWithOverride: true,
      failedBlockingRuleIds: failedBlock,
      failedWarningRuleIds: failedWarn,
    }
  }
  if (warning) {
    return {
      effectiveLevel: "warning",
      canContinue: true,
      requiresAcknowledgment: true,
      canResolveWithOverride: false,
      failedBlockingRuleIds: [],
      failedWarningRuleIds: failedWarn,
    }
  }
  return {
    effectiveLevel: "pass",
    canContinue: true,
    requiresAcknowledgment: false,
    canResolveWithOverride: false,
    failedBlockingRuleIds: [],
    failedWarningRuleIds: [],
  }
}

/**
 * `informational` no cumplido: sigue en pass agregado con requisito de "mostrar" (no añadimos 4to estado; criterio sigue con pass false pero level informativo no afecta agregado).
 */
function evalInformationalGaps(
  rows: import("./work-ready-done-controls.dto.js").CriterionEvaluationRow[],
): void {
  const has = rows.some(
    (r) => r.level === "informational" && r.isEnabled && !r.notApplicable && !r.pass,
  )
  if (!has) return
}

export function evaluateWorkControls(
  eventCode: WorkControlEventCode,
  item: ScrumBacklogItemState,
  projectApproach: "scrum" | "kanban",
  criteria: WorkControlCriterionConfig[],
  impediments: readonly ImpedimentState[],
): WorkControlsEvaluationResult {
  const map = configMap(criteria)
  const ctx: EvalCtx = { item, projectApproach, eventCode, impediments }
  const rows: import("./work-ready-done-controls.dto.js").CriterionEvaluationRow[] = []

  if (eventCode === "ready_add_to_sprint" || eventCode === "ready_start_execution") {
    for (const id of DOR_V1_RULE_IDS) {
      rows.push(evalDorRow(id, ctx, map, DOR_DEFAULTS))
    }
  } else if (eventCode === "done_close_item") {
    for (const id of DOD_V1_RULE_IDS) {
      rows.push(evalDodRow(id, ctx, map, DOD_DEFAULTS))
    }
  } else {
    throw new WorkControlsValidationError(`Unknown event: ${eventCode}`)
  }

  evalInformationalGaps(rows)
  const agg = aggregate(rows)
  let effectiveLevel: WorkControlsEvaluationResult["effectiveLevel"] = agg.effectiveLevel
  if (effectiveLevel === "pass") {
    const hasInfo = rows.some(
      (r) =>
        r.isEnabled &&
        r.level === "informational" &&
        !r.notApplicable &&
        !r.pass,
    )
    if (hasInfo) effectiveLevel = "informational"
  }
  return {
    eventCode,
    workItemPublicId: item.backlogItemPublicId,
    projectPublicId: item.projectPublicId,
    approach: projectApproach,
    criteria: rows,
    effectiveLevel,
    canContinue: agg.canContinue,
    requiresAcknowledgment: agg.requiresAcknowledgment,
    canResolveWithOverride: agg.canResolveWithOverride,
    failedBlockingRuleIds: agg.failedBlockingRuleIds,
    failedWarningRuleIds: agg.failedWarningRuleIds,
  }
}
