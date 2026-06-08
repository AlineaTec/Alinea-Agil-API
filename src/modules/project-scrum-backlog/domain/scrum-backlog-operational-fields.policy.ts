import type { ScrumBacklogItemType } from "./backlog-item-type.js"
import { ScrumBacklogValidationError } from "./scrum-backlog.errors.js"

/** Tope conservador MVP; documentado en contracts-docs work-item-operational-fields. */
export const SCRUM_BACKLOG_STORY_POINTS_MAX = 1000

/**
 * Valida `storyPoints` en creación o PATCH cuando el cliente envía el campo.
 * - `user_story` / `task` / `bug`: `null` o entero 0..MAX.
 * - `epic` / `subtask`: solo `null` permitido (limpiar / idempotente); cualquier entero → error.
 */
export function assertStoryPointsValueForItemType(
  itemType: ScrumBacklogItemType,
  storyPoints: number | null,
): void {
  if (itemType === "user_story" || itemType === "task" || itemType === "bug") {
    if (storyPoints === null) return
    if (!Number.isInteger(storyPoints)) {
      throw new ScrumBacklogValidationError("storyPoints must be an integer or null.")
    }
    if (storyPoints < 0 || storyPoints > SCRUM_BACKLOG_STORY_POINTS_MAX) {
      throw new ScrumBacklogValidationError(
        `storyPoints must be between 0 and ${SCRUM_BACKLOG_STORY_POINTS_MAX}.`,
      )
    }
    return
  }

  if (storyPoints === null) return
  throw new ScrumBacklogValidationError(
    "storyPoints cannot be set on epic or subtask in this MVP (use user_story or task).",
  )
}
