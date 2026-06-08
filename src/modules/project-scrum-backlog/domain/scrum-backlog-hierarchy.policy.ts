import type { ScrumBacklogItemType } from "./backlog-item-type.js"
import { ScrumBacklogValidationError } from "./scrum-backlog.errors.js"

/**
 * Valida relación padre-hijo según reglas base (contracts-docs project-scrum-backlog).
 * - epic: sin padre
 * - user_story: padre null o epic
 * - task: padre obligatorio user_story
 * - subtask: padre obligatorio task
 */
export function assertValidParentChildTypes(
  childType: ScrumBacklogItemType,
  parentType: ScrumBacklogItemType | null,
): void {
  if (childType === "epic") {
    if (parentType !== null) {
      throw new ScrumBacklogValidationError("An epic cannot have a parent item.")
    }
    return
  }

  if (childType === "user_story" || childType === "bug") {
    if (parentType === null) return
    if (parentType !== "epic") {
      throw new ScrumBacklogValidationError(
        "A user story or bug may only have an epic as parent, or no parent.",
      )
    }
    return
  }

  if (childType === "task") {
    if (parentType !== "user_story") {
      throw new ScrumBacklogValidationError("A task must have a user_story parent.")
    }
    return
  }

  if (childType === "subtask") {
    if (parentType !== "task") {
      throw new ScrumBacklogValidationError("A subtask must have a task parent.")
    }
  }
}
