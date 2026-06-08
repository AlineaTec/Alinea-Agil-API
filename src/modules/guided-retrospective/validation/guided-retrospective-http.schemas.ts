import { z } from "zod"
import { GUIDED_RETROSPECTIVE_TEMPLATE_CATALOG } from "../domain/guided-retrospective-template-catalog.js"
import {
  GRETRO_MAX_ACTION_DESCRIPTION,
  GRETRO_MAX_ACTION_HISTORY_MESSAGE,
  GRETRO_MAX_ACTION_TITLE,
  GRETRO_MAX_AGREEMENTS,
  GRETRO_MAX_AGREEMENT_STRING,
  GRETRO_MAX_CONTENT_LENGTH,
  GRETRO_MAX_SUMMARY,
  GRETRO_MAX_TOPIC_TITLE,
  GRETRO_MAX_TRANSCRIPT_AFTER_CLOSE,
  GRETRO_MAX_SESSION_CODE_LEN,
  GRETRO_MIN_SESSION_CODE_LEN,
} from "../domain/guided-retrospective-limits.js"

/** Cuerpo HTTP y filtros: acepta `open`/`done` legados y normaliza a `pending`/`finished`. */
const guidedRetroActionItemStatusInboundSchema = z
  .enum([
    "pending",
    "analyzing",
    "executing",
    "reviewing",
    "finished",
    "dropped",
    "open",
    "done",
  ])
  .optional()
  .transform((v) => {
    if (v == null) return undefined
    if (v === "open") return "pending" as const
    if (v === "done") return "finished" as const
    return v
  })

const templateKeySchema = z.string().refine((k) => k in GUIDED_RETROSPECTIVE_TEMPLATE_CATALOG, "Invalid template key.")

export const guidedRetroProjectParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export const guidedRetroTodayQuerySchema = z.object({
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sessionSlot: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .optional(),
})

export const guidedRetroWorkspaceParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const guidedRetroSessionHeaderBodySchema = z.object({
  templateKey: templateKeySchema.optional(),
  retrospectiveMode: z.enum(["classic", "interactive_code", "async"]).optional(),
  facilitatorUserPublicId: z.string().uuid().nullable().optional(),
  goalSummary: z.string().max(GRETRO_MAX_SUMMARY).nullable().optional(),
  sprintPublicId: z.string().uuid().nullable().optional(),
  retrospectivePeriod: z
    .object({
      periodStartYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEndYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
  status: z
    .enum(["planned", "open", "collecting", "voting", "closing"])
    .optional(),
  defaultContributionVisibility: z.enum(["visible_to_all", "hidden_from_peers"]).optional(),
  votesPerParticipant: z.number().int().min(1).max(50).optional(),
  allowMultipleVotesPerTopic: z.boolean().optional(),
})

export const guidedRetroContributionBodySchema = z.object({
  templateColumnKey: z.string().min(1).max(64),
  content: z.string().min(1).max(GRETRO_MAX_CONTENT_LENGTH),
  visibilityMode: z.enum(["visible_to_all", "hidden_from_peers"]).optional(),
})

export const guidedRetroTopicBodySchema = z.object({
  title: z.string().min(1).max(GRETRO_MAX_TOPIC_TITLE),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

export const guidedRetroMergeTopicsBodySchema = z.object({
  sourceTopicPublicId: z.string().uuid(),
  targetTopicPublicId: z.string().uuid(),
})

export const guidedRetroContributionPatchBodySchema = z.object({
  topicPublicId: z.string().uuid().nullable().optional(),
  topicStatus: z.enum(["raw", "grouped", "selected_for_vote", "discussed"]).optional(),
})

export const guidedRetroVoteBodySchema = z.object({
  stickerWeight: z.number().int().min(1).max(50).optional(),
})

export const guidedRetroCloseBodySchema = z.object({
  summary: z.string().max(GRETRO_MAX_SUMMARY).nullable().optional(),
  agreements: z.array(z.string().max(GRETRO_MAX_AGREEMENT_STRING)).max(GRETRO_MAX_AGREEMENTS),
  actionItems: z
    .array(
      z.object({
        title: z.string().min(1).max(GRETRO_MAX_ACTION_TITLE),
        description: z.string().max(GRETRO_MAX_ACTION_DESCRIPTION).nullable().optional(),
        ownerUserPublicId: z.string().uuid().nullable().optional(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        sourceContributionIds: z.array(z.string().uuid()).max(200).optional(),
        sourceTopicPublicIds: z.array(z.string().uuid()).max(200).optional(),
        status: guidedRetroActionItemStatusInboundSchema,
      }),
    )
    .max(200),
})

export const guidedRetroAdditiveNoteBodySchema = z.object({
  note: z.string().min(1).max(GRETRO_MAX_SUMMARY),
})

export const guidedRetroTranscriptAfterCloseBodySchema = z.object({
  transcript: z.string().max(GRETRO_MAX_TRANSCRIPT_AFTER_CLOSE),
})

export const guidedRetroRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const guidedRetroJoinBodySchema = z.object({
  sessionCode: z
    .string()
    .min(GRETRO_MIN_SESSION_CODE_LEN)
    .max(GRETRO_MAX_SESSION_CODE_LEN)
    .regex(/^[A-Z0-9]+$/),
})

export const guidedRetroPublicResolveJoinBodySchema = z.object({
  sessionCode: z
    .string()
    .min(GRETRO_MIN_SESSION_CODE_LEN)
    .max(GRETRO_MAX_SESSION_CODE_LEN)
    .regex(/^[A-Z0-9]+$/),
  turnstileToken: z.string().min(1).max(4096).optional(),
})

export const guidedRetroTopicParamsSchema = guidedRetroProjectParamsSchema.extend({
  topicId: z.string().uuid(),
})

export const guidedRetroContributionParamsSchema = guidedRetroProjectParamsSchema.extend({
  contributionPublicId: z.string().uuid(),
})

export const guidedRetroProjectActionItemsQuerySchema = z
  .object({
    status: guidedRetroActionItemStatusInboundSchema,
    assignee: z.enum(["me"]).optional(),
    ownerUserPublicId: z.string().uuid().optional(),
    /** `1` o `true`: solo acciones sin responsable asignado. */
    unassigned: z.enum(["1", "true"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine(
    (d) => {
      let n = 0
      if (d.assignee === "me") n++
      if (d.ownerUserPublicId != null) n++
      if (d.unassigned != null) n++
      return n <= 1
    },
    { path: ["ownerUserPublicId"], message: "Use at most one of assignee, ownerUserPublicId, or unassigned." },
  )

export const guidedRetroProjectActionItemParamsSchema = guidedRetroProjectParamsSchema.extend({
  actionItemPublicId: z.string().uuid(),
})

export const guidedRetroProjectActionItemPatchBodySchema = z.object({
  title: z.string().min(1).max(GRETRO_MAX_ACTION_TITLE).optional(),
  description: z.string().max(GRETRO_MAX_ACTION_DESCRIPTION).nullable().optional(),
  ownerUserPublicId: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: guidedRetroActionItemStatusInboundSchema,
  historyNote: z.string().min(1).max(GRETRO_MAX_ACTION_HISTORY_MESSAGE).optional(),
})
