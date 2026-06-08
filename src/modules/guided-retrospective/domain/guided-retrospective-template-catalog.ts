import { GuidedRetrospectiveValidationError } from "./guided-retrospective.errors.js"

export type RetroTemplateColumn = { columnKey: string }

export type RetroTemplateDefinition = {
  templateKey: string
  columns: RetroTemplateColumn[]
  votesPerParticipant: number
  allowMultipleVotesPerTopic: boolean
}

/** Catálogo fijo v1 — contracts-docs `retrospective-template-model.md`. */
export const GUIDED_RETROSPECTIVE_TEMPLATE_CATALOG: Record<string, RetroTemplateDefinition> = {
  start_stop_continue: {
    templateKey: "start_stop_continue",
    columns: [{ columnKey: "start" }, { columnKey: "stop" }, { columnKey: "continue" }],
    votesPerParticipant: 3,
    allowMultipleVotesPerTopic: false,
  },
  mad_sad_glad: {
    templateKey: "mad_sad_glad",
    columns: [{ columnKey: "mad" }, { columnKey: "sad" }, { columnKey: "glad" }],
    votesPerParticipant: 3,
    allowMultipleVotesPerTopic: false,
  },
  four_ls: {
    templateKey: "four_ls",
    columns: [
      { columnKey: "liked" },
      { columnKey: "learned" },
      { columnKey: "lacked" },
      { columnKey: "longed_for" },
    ],
    votesPerParticipant: 4,
    allowMultipleVotesPerTopic: false,
  },
  went_well_didnt_go_well_actions: {
    templateKey: "went_well_didnt_go_well_actions",
    columns: [{ columnKey: "went_well" }, { columnKey: "didnt_go_well" }, { columnKey: "actions" }],
    votesPerParticipant: 3,
    allowMultipleVotesPerTopic: false,
  },
  sailboat: {
    templateKey: "sailboat",
    columns: [
      { columnKey: "wind" },
      { columnKey: "anchors" },
      { columnKey: "rocks" },
      { columnKey: "island" },
    ],
    votesPerParticipant: 3,
    allowMultipleVotesPerTopic: false,
  },
}

export function getRetroTemplateOrThrow(templateKey: string): RetroTemplateDefinition {
  const t = GUIDED_RETROSPECTIVE_TEMPLATE_CATALOG[templateKey]
  if (!t) {
    throw new GuidedRetrospectiveValidationError(`Unknown retrospective template: ${templateKey}`)
  }
  return t
}

export function isValidTemplateColumn(templateKey: string, columnKey: string): boolean {
  const t = GUIDED_RETROSPECTIVE_TEMPLATE_CATALOG[templateKey]
  if (!t) return false
  return t.columns.some((c) => c.columnKey === columnKey)
}
