/**
 * @see contracts-docs/docs/modules/work-ready-done-controls/
 */

export const WORK_CONTROL_EVENT_CODES = [
  "ready_add_to_sprint",
  "ready_start_execution",
  "done_close_item",
] as const

export type WorkControlEventCode = (typeof WORK_CONTROL_EVENT_CODES)[number]

export const WORK_CONTROL_SEVERITY_LEVELS = ["informational", "warning", "blocking"] as const

export type WorkControlSeverityLevel = (typeof WORK_CONTROL_SEVERITY_LEVELS)[number]

/**
 * Criterios v1 soportados por el evaluador (identificador estable, snake_case).
 * Postergado en código: subtareas “obligatorias” (sin semántica de obligatoriedad en dominio aún).
 */
export const DOR_V1_RULE_IDS = [
  "dor_title_present",
  "dor_description_present",
  "dor_acceptance_criteria_present",
  "dor_priority_defined",
  "dor_story_points_if_scrum",
  "dor_no_open_critical_impediment",
  "dor_assignee_present", // v1: default warning, no block (configurable)
] as const

export const DOD_V1_RULE_IDS = [
  "dod_acceptance_criteria_satisfied",
  "dod_no_open_critical_impediment",
  "dod_not_blocked",
  "dod_status_ready_for_done", // pasa a done solo si el estado/ flujo lo permite
] as const

export type DorV1RuleId = (typeof DOR_V1_RULE_IDS)[number]
export type DodV1RuleId = (typeof DOD_V1_RULE_IDS)[number]

export const ALL_V1_RULE_IDS = [...DOR_V1_RULE_IDS, ...DOD_V1_RULE_IDS] as const
export type WorkControlV1RuleId = (typeof ALL_V1_RULE_IDS)[number]

export const DEFAULT_PROFILE_VERSION = 1
