import { z } from "zod"
import {
  ALL_V1_RULE_IDS,
  DEFAULT_PROFILE_VERSION,
  WORK_CONTROL_EVENT_CODES,
  WORK_CONTROL_SEVERITY_LEVELS,
} from "../domain/work-ready-done-controls.constants.js"

const V1_RULE_IDS_TUPLE = ALL_V1_RULE_IDS as unknown as [string, ...string[]]
const EVENT_CODES_TUPLE = WORK_CONTROL_EVENT_CODES as unknown as [string, ...string[]]

const criteriaRowSchema = z
  .object({
    ruleId: z.enum(V1_RULE_IDS_TUPLE),
    isEnabled: z.boolean(),
    level: z.enum(WORK_CONTROL_SEVERITY_LEVELS),
  })
  .strict()

export const workControlsProjectMountParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    projectPublicId: z.string().uuid(),
  })
  .strict()

/** Sólo `workspacePublicId` + `projectPublicId` bajo un router `mergeParams` con workspace en padre. */
export const workControlsProjectParamIdsSchema = z
  .object({
    projectPublicId: z.string().uuid(),
  })
  .strict()

export const workControlsWorkspaceParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
  })
  .strict()

export const workControlsProjectPatchBodySchema = z
  .object({
    version: z.literal(DEFAULT_PROFILE_VERSION).optional(),
    criteria: z.array(criteriaRowSchema).min(1),
    kanbanColumnMapping: z
      .object({
        startExecutionColumnPublicId: z.string().uuid().nullable(),
        doneCloseItemColumnPublicId: z.string().uuid().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const workControlsTemplatePatchBodySchema = z
  .object({
    version: z.literal(1).optional(),
    criteria: z.array(criteriaRowSchema).min(1),
  })
  .strict()

export const workControlsEvaluationQuerySchema = z
  .object({
    eventCode: z.enum(EVENT_CODES_TUPLE),
  })
  .strict()

export const workControlsEvaluationItemParamsSchema = workControlsProjectMountParamsSchema.extend({
  workItemPublicId: z.string().uuid(),
})

export const workControlsIssueOverrideBodySchema = z
  .object({
    workItemPublicId: z.string().uuid(),
    eventCode: z.enum(EVENT_CODES_TUPLE),
    reason: z.string().trim().min(1, "Override reason is required.").max(4000),
  })
  .strict()
