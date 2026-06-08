import { randomUUID } from "node:crypto"
import { isAcceptanceCriterionStatus } from "./acceptance-criterion-status.js"
import type { AcceptanceCriterionState } from "./acceptance-criterion.js"
import type { ScrumBacklogItemType } from "./backlog-item-type.js"
import { ScrumBacklogValidationError } from "./scrum-backlog.errors.js"

export const SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX = 20
export const SCRUM_BACKLOG_ACCEPTANCE_CRITERION_TEXT_MAX = 4000

export type AcceptanceCriterionPatchInput = {
  acceptanceCriterionPublicId?: string | null
  text: string
  status: string
}

export function mergeAcceptanceCriteriaFromPatch(
  itemType: ScrumBacklogItemType,
  current: readonly AcceptanceCriterionState[],
  input: AcceptanceCriterionPatchInput[],
  now: Date,
): AcceptanceCriterionState[] {
  if (itemType === "epic" || itemType === "subtask") {
    if (input.length > 0) {
      throw new ScrumBacklogValidationError(
        "acceptanceCriteria is not supported for epic or subtask in this MVP.",
      )
    }
    return []
  }

  if (input.length > SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX) {
    throw new ScrumBacklogValidationError(
      `At most ${SCRUM_BACKLOG_ACCEPTANCE_CRITERIA_MAX} acceptance criteria per item.`,
    )
  }

  const seenIds = new Set<string>()
  const currentMap = new Map(current.map((c) => [c.acceptanceCriterionPublicId, c]))
  const next: AcceptanceCriterionState[] = []

  for (const row of input) {
    const text = row.text.trim()
    if (!text) {
      throw new ScrumBacklogValidationError("Acceptance criterion text cannot be empty.")
    }
    if (text.length > SCRUM_BACKLOG_ACCEPTANCE_CRITERION_TEXT_MAX) {
      throw new ScrumBacklogValidationError(
        `Acceptance criterion text cannot exceed ${SCRUM_BACKLOG_ACCEPTANCE_CRITERION_TEXT_MAX} characters.`,
      )
    }
    if (!isAcceptanceCriterionStatus(row.status)) {
      throw new ScrumBacklogValidationError(
        `Invalid acceptance criterion status: ${row.status}. Use pending, done, or reviewed.`,
      )
    }

    const rawId = row.acceptanceCriterionPublicId
    if (rawId !== undefined && rawId !== null && String(rawId).trim() !== "") {
      const id = String(rawId).trim()
      if (seenIds.has(id)) {
        throw new ScrumBacklogValidationError("Duplicate acceptanceCriterionPublicId in request body.")
      }
      seenIds.add(id)
      const existing = currentMap.get(id)
      if (existing) {
        next.push({
          acceptanceCriterionPublicId: id,
          text,
          status: row.status,
          createdAt: existing.createdAt,
          updatedAt: now,
        })
      } else {
        throw new ScrumBacklogValidationError(
          `Unknown acceptanceCriterionPublicId: ${id}. Omit the id to create a new criterion.`,
        )
      }
    } else {
      const id = randomUUID()
      if (seenIds.has(id)) {
        throw new ScrumBacklogValidationError("Duplicate acceptance criterion id after generation.")
      }
      seenIds.add(id)
      next.push({
        acceptanceCriterionPublicId: id,
        text,
        status: row.status,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return next
}
